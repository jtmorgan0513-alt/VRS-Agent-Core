import { useState, useRef, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth, getToken } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Camera, Send, Lock, Video, X, Sparkles, Loader2, AlertTriangle, Square, Mic, MicOff, Trash2, Info, Plus } from "lucide-react";
import HelpTooltip from "@/components/help-tooltip";

const APPLIANCE_TYPES = [
  { value: "refrigeration", label: "Refrigerator" },
  { value: "laundry", label: "Laundry" },
  { value: "cooking", label: "Cooking" },
  { value: "dishwasher", label: "Dishwasher / Compactor" },
  { value: "microwave", label: "Microwave" },
  { value: "hvac", label: "HVAC" },
  { value: "all_other", label: "All Other" },
];

const WARRANTY_PROVIDERS = [
  { value: "sears_protect", label: "Sears Protect / Sears PA / Sears Home Warranty (Cinch)", available: true },
  { value: "american_home_shield", label: "American Home Shield", available: true },
  { value: "first_american", label: "First American", available: true },
];

const submissionFormSchema = z.object({
  serviceOrder: z.string().regex(/^\d{4}-\d{8}$/, "Service order must be in format DDDD-SSSSSSSS (e.g., 8175-12345678)"),
  phone: z.string().min(7, "Valid phone number is required"),
  applianceType: z.enum(["cooking", "dishwasher", "microwave", "laundry", "refrigeration", "hvac", "all_other"], {
    required_error: "Select an appliance type",
  }),
  requestType: z.enum(["authorization", "infestation_non_accessible", "parts_nla"]),
  warrantyType: z.enum(["sears_protect", "american_home_shield", "first_american"]).default("sears_protect"),
  warrantyProvider: z.string().optional(),
  issueDescription: z.string().min(10, "Please provide at least 10 characters").max(2000, "Description must be 2000 characters or less"),
  partNumbers: z.array(z.string()).optional(),
});

type SubmissionFormData = z.infer<typeof submissionFormSchema>;

export default function TechSubmitPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const estimatePhotoInputRef = useRef<HTMLInputElement>(null);
  const issuePhotoInputRef = useRef<HTMLInputElement>(null);
  const soNumberRef = useRef<HTMLInputElement>(null);
  const [estimatePhotoUrls, setEstimatePhotoUrls] = useState<string[]>([]);
  const [issuePhotoUrls, setIssuePhotoUrls] = useState<string[]>([]);
  const [estimatePhotoLocalPreviews, setEstimatePhotoLocalPreviews] = useState<Record<string, string>>({});
  const [issuePhotoLocalPreviews, setIssuePhotoLocalPreviews] = useState<Record<string, string>>({});
  const [estimatePhotoUploading, setEstimatePhotoUploading] = useState(false);
  const [issuePhotoUploading, setIssuePhotoUploading] = useState(false);
  const [estimatePhotoUploadCount, setEstimatePhotoUploadCount] = useState({ done: 0, total: 0 });
  const [issuePhotoUploadCount, setIssuePhotoUploadCount] = useState({ done: 0, total: 0 });
  const [aiPreview, setAiPreview] = useState<string | null>(null);
  const [originalBeforeAi, setOriginalBeforeAi] = useState<string | null>(null);
  const [aiUsed, setAiUsed] = useState(false);
  const [aiEdited, setAiEdited] = useState(false);
  const [voiceNoteUrl, setVoiceNoteUrl] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [audioUploading, setAudioUploading] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioFileInputRef = useRef<HTMLInputElement>(null);
  const [partNumbers, setPartNumbers] = useState<string[]>([""]);
  const [availableParts, setAvailableParts] = useState<string[]>([]);

  type FailedUpload = {
    id: string;
    file: File;
    category: "estimate" | "issue";
    lastError: string;
    attemptsUsed: number;
  };
  const [failedUploads, setFailedUploads] = useState<FailedUpload[]>([]);
  const [retryingIds, setRetryingIds] = useState<Set<string>>(new Set());

  function reportUploadError(details: Record<string, unknown>) {
    try {
      const token = getToken();
      fetch("/api/uploads/report-error", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          ...details,
          userAgent: navigator.userAgent,
          timestamp: new Date().toISOString(),
        }),
      }).catch(() => {});
    } catch {}
  }

  async function uploadSinglePhoto(file: File, retries = 2): Promise<string | null> {
    const token = getToken();
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const urlRes = await fetch("/api/uploads/request-url", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            name: file.name,
            size: file.size,
            contentType: file.type,
          }),
        });
        if (!urlRes.ok) {
          reportUploadError({ stage: "request-url", fileName: file.name, fileSize: file.size, fileType: file.type, errorMessage: "HTTP " + urlRes.status, attempt });
          throw new Error("Failed to get upload URL");
        }
        const { uploadURL, objectPath } = await urlRes.json();

        const result = await new Promise<string | null>((resolve) => {
          const xhr = new XMLHttpRequest();
          xhr.timeout = 120000;
          xhr.addEventListener("load", () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve(objectPath);
            } else {
              reportUploadError({ stage: "xhr-upload", fileName: file.name, fileSize: file.size, fileType: file.type, xhrStatus: xhr.status, attempt });
              resolve(null);
            }
          });
          xhr.addEventListener("error", () => {
            reportUploadError({ stage: "xhr-error", fileName: file.name, fileSize: file.size, fileType: file.type, errorMessage: "network error", attempt });
            resolve(null);
          });
          xhr.addEventListener("timeout", () => {
            reportUploadError({ stage: "xhr-timeout", fileName: file.name, fileSize: file.size, fileType: file.type, errorMessage: "timeout after 120s", attempt });
            resolve(null);
          });
          xhr.open("PUT", uploadURL);
          xhr.setRequestHeader("Content-Type", file.type);
          xhr.send(file);
        });
        if (result) return result;
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        }
      } catch (error) {
        reportUploadError({ stage: "unknown", fileName: file.name, fileSize: file.size, fileType: file.type, errorMessage: String(error), attempt });
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        }
      }
    }
    return null;
  }

  async function handlePhotosSelect(
    files: FileList | null,
    currentUrls: string[],
    setUrls: React.Dispatch<React.SetStateAction<string[]>>,
    setUploading: React.Dispatch<React.SetStateAction<boolean>>,
    setCount: React.Dispatch<React.SetStateAction<{ done: number; total: number }>>,
    maxPhotos: number,
    inputRef: React.RefObject<HTMLInputElement | null>,
    setLocalPreviews?: React.Dispatch<React.SetStateAction<Record<string, string>>>,
  ) {
    if (!files || files.length === 0) return;
    const validFiles = Array.from(files).filter((f) => f.size <= 20 * 1024 * 1024 && (f.type.startsWith("image/") || f.type === ""));
    if (validFiles.length === 0) {
      const fileDetails = Array.from(files).map(f => ({ name: f.name, size: f.size, type: f.type }));
      reportUploadError({ stage: "file-filter", errorMessage: "All files filtered out", files: fileDetails });
      toast({ title: "Invalid Files", description: "Please select image files under 20MB each.", variant: "destructive" });
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    const totalAllowed = maxPhotos - currentUrls.length;
    const filesToUpload = validFiles.slice(0, totalAllowed);
    if (filesToUpload.length < validFiles.length) {
      toast({ title: "Photo Limit", description: `Maximum ${maxPhotos} photos allowed. Only uploading ${filesToUpload.length} more.` });
    }
    setUploading(true);
    setCount({ done: 0, total: filesToUpload.length });
    const newUrls: string[] = [];
    const newPreviews: Record<string, string> = {};
    const newFailures: FailedUpload[] = [];
    const categoryForList: "estimate" | "issue" = setUrls === setEstimatePhotoUrls ? "estimate" : "issue";
    for (let i = 0; i < filesToUpload.length; i++) {
      const file = filesToUpload[i];
      const localBlob = URL.createObjectURL(file);
      const url = await uploadSinglePhoto(file);
      if (url) {
        newUrls.push(url);
        newPreviews[url] = localBlob;
      } else {
        URL.revokeObjectURL(localBlob);
        newFailures.push({
          id: crypto.randomUUID(),
          file,
          category: categoryForList,
          lastError: "Upload failed after retries",
          attemptsUsed: 3,
        });
      }
      setCount({ done: i + 1, total: filesToUpload.length });
    }
    setUrls((prev) => [...prev, ...newUrls]);
    if (setLocalPreviews) {
      setLocalPreviews((prev) => ({ ...prev, ...newPreviews }));
    }
    if (newFailures.length > 0) {
      setFailedUploads((prev) => [...prev, ...newFailures]);
    }
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
    if (newFailures.length > 0) {
      toast({
        title: "Some photos failed",
        description: `${newFailures.length} photo(s) failed. Scroll down to retry.`,
        variant: "destructive",
      });
    }
  }

  async function retryFailedUpload(failedId: string) {
    const failed = failedUploads.find((f) => f.id === failedId);
    if (!failed) return;
    setRetryingIds((prev) => new Set(prev).add(failedId));
    const url = await uploadSinglePhoto(failed.file);
    setRetryingIds((prev) => {
      const next = new Set(prev);
      next.delete(failedId);
      return next;
    });
    if (url) {
      const localBlob = URL.createObjectURL(failed.file);
      if (failed.category === "estimate") {
        setEstimatePhotoUrls((prev) => [...prev, url]);
        setEstimatePhotoLocalPreviews((prev) => ({ ...prev, [url]: localBlob }));
      } else {
        setIssuePhotoUrls((prev) => [...prev, url]);
        setIssuePhotoLocalPreviews((prev) => ({ ...prev, [url]: localBlob }));
      }
      setFailedUploads((prev) => prev.filter((f) => f.id !== failedId));
      toast({ title: "Retry succeeded", description: failed.file.name });
    } else {
      setFailedUploads((prev) =>
        prev.map((f) =>
          f.id === failedId
            ? { ...f, attemptsUsed: f.attemptsUsed + 3, lastError: "Retry failed" }
            : f
        )
      );
      toast({
        title: "Retry failed",
        description: `${failed.file.name} — check your connection.`,
        variant: "destructive",
      });
    }
  }

  function dismissFailedUpload(failedId: string) {
    setFailedUploads((prev) => prev.filter((f) => f.id !== failedId));
  }

  function isVideoFile(file: File): boolean {
    if (file.type.startsWith("video/")) return true;
    const name = file.name.toLowerCase();
    return /\.(mp4|mov|m4v|webm|mkv|avi|3gp|3gpp|wmv|flv|ts|mts)$/.test(name);
  }

  function handleVideoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setVideoError(null);

    if (!isVideoFile(file)) {
      setVideoError("Please select a video file");
      if (videoInputRef.current) videoInputRef.current.value = "";
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      setVideoError("Video file exceeds 50MB limit");
      if (videoInputRef.current) videoInputRef.current.value = "";
      return;
    }

    const videoEl = document.createElement("video");
    videoEl.preload = "metadata";
    videoEl.onloadedmetadata = () => {
      URL.revokeObjectURL(videoEl.src);
      if (videoEl.duration > 30) {
        setVideoError("Video must be 30 seconds or less");
        if (videoInputRef.current) videoInputRef.current.value = "";
        return;
      }
      uploadVideo(file);
    };
    videoEl.onerror = () => {
      URL.revokeObjectURL(videoEl.src);
      uploadVideo(file);
    };
    videoEl.src = URL.createObjectURL(file);
  }

  async function convertVideo(objectPath: string): Promise<string> {
    setIsConverting(true);
    try {
      const res = await apiRequest("POST", "/api/uploads/convert-video", { objectPath });
      const data = await res.json();
      if (data.converted === false) {
        toast({ title: "Video Format Notice", description: "Video could not be converted to MP4. It may not play on all devices.", variant: "destructive" });
      }
      return data.objectPath;
    } catch {
      toast({ title: "Video Format Notice", description: "Video conversion failed. The original file will be used.", variant: "destructive" });
      return objectPath;
    } finally {
      setIsConverting(false);
    }
  }

  function needsConversion(file: File): boolean {
    if (file.type === "video/mp4") return false;
    const name = file.name.toLowerCase();
    if (name.endsWith(".mp4")) return false;
    return true;
  }

  async function uploadVideo(file: File) {
    const token = getToken();
    setIsUploading(true);
    setUploadProgress(0);

    try {
      setUploadProgress(10);
      const urlRes = await fetch("/api/uploads/request-url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          name: file.name,
          size: file.size,
          contentType: file.type,
        }),
      });

      if (!urlRes.ok) {
        throw new Error("Failed to get upload URL");
      }

      const { uploadURL, objectPath } = await urlRes.json();

      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) {
          setUploadProgress(10 + Math.round((e.loaded / e.total) * 90));
        }
      });

      xhr.addEventListener("load", async () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          if (needsConversion(file)) {
            setIsUploading(false);
            const convertedPath = await convertVideo(objectPath);
            setVideoUrl(convertedPath);
          } else {
            setIsUploading(false);
            setVideoUrl(objectPath);
          }
        } else {
          setIsUploading(false);
          toast({ title: "Upload Failed", description: "Failed to upload video to storage", variant: "destructive" });
        }
      });

      xhr.addEventListener("error", () => {
        setIsUploading(false);
        toast({ title: "Upload Failed", description: "Network error during upload", variant: "destructive" });
      });

      xhr.open("PUT", uploadURL);
      xhr.setRequestHeader("Content-Type", file.type);
      xhr.send(file);
    } catch (err) {
      setIsUploading(false);
      toast({ title: "Upload Failed", description: "Failed to initiate upload", variant: "destructive" });
    }
  }

  function removeVideo() {
    setVideoUrl(null);
    setUploadProgress(0);
    setVideoError(null);
    if (videoInputRef.current) videoInputRef.current.value = "";
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4' });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      setRecordingDuration(0);

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        if (recordingIntervalRef.current) {
          clearInterval(recordingIntervalRef.current);
          recordingIntervalRef.current = null;
        }
        const blob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType });
        const ext = mediaRecorder.mimeType.includes('webm') ? 'webm' : 'm4a';
        const file = new File([blob], `voice-note.${ext}`, { type: mediaRecorder.mimeType });
        await uploadAudioFile(file);
      };

      mediaRecorder.start(1000);
      setIsRecording(true);
      recordingIntervalRef.current = setInterval(() => {
        setRecordingDuration(prev => {
          if (prev >= 120) {
            stopRecording();
            return prev;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err) {
      toast({ title: "Microphone Access", description: "Please allow microphone access to record a voice note.", variant: "destructive" });
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }

  function audioNeedsConversion(file: File): boolean {
    const name = file.name.toLowerCase();
    const webFriendly = ["audio/mpeg", "audio/mp3", "audio/mp4", "audio/x-m4a", "audio/aac", "audio/wav", "audio/webm", "audio/ogg", "audio/flac", "audio/x-flac"];
    if (webFriendly.some(t => file.type === t)) return false;
    if (/\.(mp3|m4a|aac|wav|webm|ogg|mp4|flac)$/.test(name)) return false;
    return true;
  }

  async function convertAudio(objectPath: string): Promise<string> {
    try {
      const res = await apiRequest("POST", "/api/uploads/convert-audio", { objectPath });
      const data = await res.json();
      if (data.converted === false) {
        toast({ title: "Audio Format Notice", description: "Audio could not be converted. It may not play on all devices.", variant: "destructive" });
      }
      return data.objectPath;
    } catch {
      return objectPath;
    }
  }

  async function uploadAudioFile(file: File) {
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "File Too Large", description: "Audio file must be under 10MB.", variant: "destructive" });
      return;
    }
    setAudioUploading(true);
    const url = await uploadSinglePhoto(file);
    if (url) {
      if (audioNeedsConversion(file)) {
        const converted = await convertAudio(url);
        setVoiceNoteUrl(converted);
      } else {
        setVoiceNoteUrl(url);
      }
    } else {
      toast({ title: "Upload Failed", description: "Failed to upload audio file.", variant: "destructive" });
    }
    setAudioUploading(false);
  }

  function isAudioFile(file: File): boolean {
    if (file.type.startsWith("audio/")) return true;
    const name = file.name.toLowerCase();
    return /\.(mp3|m4a|aac|wav|webm|ogg|wma|amr|3gp|caf|flac|opus)$/.test(name);
  }

  function handleAudioFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!isAudioFile(file)) {
      toast({ title: "Invalid File", description: "Please select an audio file.", variant: "destructive" });
      if (audioFileInputRef.current) audioFileInputRef.current.value = "";
      return;
    }
    uploadAudioFile(file);
    if (audioFileInputRef.current) audioFileInputRef.current.value = "";
  }

  function removeVoiceNote() {
    setVoiceNoteUrl(null);
    setRecordingDuration(0);
  }

  function formatDuration(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  const form = useForm<SubmissionFormData>({
    resolver: zodResolver(submissionFormSchema),
    defaultValues: {
      serviceOrder: "",
      phone: user?.phone || "",
      applianceType: undefined,
      requestType: "authorization",
      warrantyType: "sears_protect",
      warrantyProvider: "Sears Protect / Sears PA / Sears Home Warranty (Cinch)",
      issueDescription: "",
    },
  });

  const watchedServiceOrder = form.watch("serviceOrder");
  const isValidSo = /^\d{4}-\d{8}$/.test(watchedServiceOrder || "");
  const warrantyLookup = useQuery<{
    serviceOrder: string;
    procId: string;
    clientNm: string;
    derived: { warrantyType: "sears_protect" | "american_home_shield" | "first_american"; warrantyProvider: string; source: "client_nm" | "proc_id" } | null;
  }>({
    queryKey: ["/api/tech/lookup-warranty", watchedServiceOrder],
    enabled: isValidSo,
    staleTime: 5 * 60 * 1000,
  });
  const derivedWarranty = warrantyLookup.data?.derived || null;

  useEffect(() => {
    if (derivedWarranty) {
      if (form.getValues("warrantyType") !== derivedWarranty.warrantyType) {
        form.setValue("warrantyType", derivedWarranty.warrantyType, { shouldDirty: false });
      }
      if (form.getValues("warrantyProvider") !== derivedWarranty.warrantyProvider) {
        form.setValue("warrantyProvider", derivedWarranty.warrantyProvider, { shouldDirty: false });
      }
    }
  }, [derivedWarranty?.warrantyType, derivedWarranty?.warrantyProvider]);

  const mutation = useMutation({
    mutationFn: async (data: SubmissionFormData & { originalDescription?: string; aiEnhanced?: boolean }) => {
      const res = await apiRequest("POST", "/api/submissions", data);
      return await res.json();
    },
    onSuccess: (data) => {
      try { localStorage.removeItem(DRAFT_KEY); } catch {}
      queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string).startsWith("/api/submissions") });
      toast({ title: "Submission Created", description: `Service Order #${data.submission.serviceOrder} submitted successfully.` });
      setLocation(`/tech/submissions/${data.submission.id}`);
    },
    onError: (error: Error) => {
      toast({ title: "Submission Failed", description: error.message, variant: "destructive" });
    },
  });

  const aiEnhanceMutation = useMutation({
    mutationFn: async (data: { description: string; applianceType: string }) => {
      const res = await apiRequest("POST", "/api/ai/enhance-description", data);
      return await res.json();
    },
    onSuccess: (data: { enhanced: string; original: string }) => {
      setAiPreview(data.enhanced);
      setOriginalBeforeAi(data.original);
    },
    onError: (error: Error) => {
      toast({ title: "AI Enhancement Unavailable", description: error.message, variant: "destructive" });
    },
  });

  function onSubmit(data: SubmissionFormData) {
    if (data.requestType === "parts_nla") {
      const nlaParts = partNumbers.filter(p => p.trim() !== "");
      const otherParts = availableParts.filter(p => p.trim() !== "");
      if (nlaParts.length === 0 && otherParts.length === 0) {
        toast({ title: "Part Numbers Required", description: "At least one NLA or available part number is required.", variant: "destructive" });
        return;
      }
    }
    const payload: any = { ...data };
    delete payload.partNumbers;
    if (aiUsed && originalBeforeAi) {
      payload.originalDescription = originalBeforeAi;
      payload.aiEnhanced = true;
    }
    if (videoUrl) payload.videoUrl = videoUrl;
    if (voiceNoteUrl) payload.voiceNoteUrl = voiceNoteUrl;
    const phoneOverride = localStorage.getItem("vrs_phone_override");
    if (phoneOverride) payload.phoneOverride = phoneOverride;
    const photosObj: any = {};
    if (estimatePhotoUrls.length > 0) photosObj.estimate = estimatePhotoUrls;
    if (issuePhotoUrls.length > 0) photosObj.issue = issuePhotoUrls;
    if (Object.keys(photosObj).length > 0) payload.photos = JSON.stringify(photosObj);
    if (data.requestType === "parts_nla") {
      const nlaParts = partNumbers.filter(p => p.trim() !== "");
      const otherParts = availableParts.filter(p => p.trim() !== "");
      if (nlaParts.length > 0 || otherParts.length > 0) {
        payload.partNumbers = JSON.stringify({ nla: nlaParts, available: otherParts });
      }
    }
    mutation.mutate(payload as any);
  }

  const watchedRequestType = form.watch("requestType");
  const watchedValues = form.watch();
  const descriptionLength = watchedValues.issueDescription?.length || 0;
  const aiButtonDisabled = descriptionLength < 20 || aiEnhanceMutation.isPending;

  const DRAFT_KEY = `vrs_tech_submit_draft_v1_${user?.id ?? "anon"}`;
  const [draftRestored, setDraftRestored] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const draftHydratedRef = useRef(false);

  useEffect(() => {
    if (!user?.id || draftHydratedRef.current) return;
    draftHydratedRef.current = true;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw);
      if (draft.formValues) form.reset({ ...form.getValues(), ...draft.formValues });
      if (Array.isArray(draft.estimatePhotoUrls)) setEstimatePhotoUrls(draft.estimatePhotoUrls);
      if (Array.isArray(draft.issuePhotoUrls)) setIssuePhotoUrls(draft.issuePhotoUrls);
      if (typeof draft.videoUrl === "string") setVideoUrl(draft.videoUrl);
      if (typeof draft.voiceNoteUrl === "string") setVoiceNoteUrl(draft.voiceNoteUrl);
      if (Array.isArray(draft.partNumbers) && draft.partNumbers.length) setPartNumbers(draft.partNumbers);
      if (Array.isArray(draft.availableParts) && draft.availableParts.length) setAvailableParts(draft.availableParts);
      if (typeof draft.aiUsed === "boolean") setAiUsed(draft.aiUsed);
      if (typeof draft.originalBeforeAi === "string") setOriginalBeforeAi(draft.originalBeforeAi);
      if (typeof draft.aiEdited === "boolean") setAiEdited(draft.aiEdited);
      setDraftRestored(true);
      setDraftSavedAt(draft.savedAt || null);
      toast({
        title: "Draft restored",
        description: "We brought back your in-progress submission so you don't have to start over.",
      });
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || !draftHydratedRef.current) return;
    const handle = setTimeout(() => {
      const formValues = form.getValues();
      const hasContent = Boolean(
        formValues.serviceOrder?.trim() ||
        formValues.applianceType ||
        (formValues.issueDescription && formValues.issueDescription.trim().length > 0) ||
        estimatePhotoUrls.length ||
        issuePhotoUrls.length ||
        videoUrl ||
        voiceNoteUrl ||
        partNumbers.some(p => p.trim()) ||
        availableParts.some(p => p.trim())
      );
      if (!hasContent) {
        try { localStorage.removeItem(DRAFT_KEY); } catch {}
        return;
      }
      const draft = {
        formValues,
        estimatePhotoUrls,
        issuePhotoUrls,
        videoUrl,
        voiceNoteUrl,
        partNumbers,
        availableParts,
        aiUsed,
        originalBeforeAi,
        aiEdited,
        savedAt: new Date().toISOString(),
      };
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
        setDraftSavedAt(draft.savedAt);
      } catch {}
    }, 600);
    return () => clearTimeout(handle);
  }, [
    user?.id,
    watchedValues,
    estimatePhotoUrls,
    issuePhotoUrls,
    videoUrl,
    voiceNoteUrl,
    partNumbers,
    availableParts,
    aiUsed,
    originalBeforeAi,
    aiEdited,
    DRAFT_KEY,
  ]);

  function discardDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch {}
    form.reset({
      serviceOrder: "",
      phone: user?.phone || "",
      applianceType: undefined as any,
      requestType: "authorization",
      warrantyType: "sears_protect",
      warrantyProvider: "Sears Protect / Sears PA / Sears Home Warranty (Cinch)",
      issueDescription: "",
    });
    setEstimatePhotoUrls([]);
    setIssuePhotoUrls([]);
    setEstimatePhotoLocalPreviews({});
    setIssuePhotoLocalPreviews({});
    setVideoUrl(null);
    setVoiceNoteUrl(null);
    setPartNumbers([""]);
    setAvailableParts([]);
    setAiUsed(false);
    setAiEdited(false);
    setAiPreview(null);
    setOriginalBeforeAi(null);
    setDraftRestored(false);
    setDraftSavedAt(null);
    setFailedUploads([]);
    setRetryingIds(new Set());
    toast({ title: "Draft discarded", description: "Starting fresh." });
  }

  function formatDraftSavedAt(iso: string | null): string {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    } catch { return ""; }
  }

  return (
    <div className="min-h-screen pb-20">
      <div className="bg-primary text-primary-foreground p-4">
        <div className="max-w-lg mx-auto">
          <h1 className="text-lg font-bold" data-testid="text-submit-title">VRS Submission</h1>
          <p className="text-sm opacity-80">New Authorization Request</p>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4">
        {draftRestored && (
          <div
            className="mb-4 rounded-md border border-primary/30 bg-primary/5 p-3 flex items-start justify-between gap-3"
            data-testid="banner-draft-restored"
          >
            <div className="text-sm">
              <div className="font-medium" data-testid="text-draft-restored-title">Draft restored</div>
              <div className="text-muted-foreground" data-testid="text-draft-restored-detail">
                Picked up where you left off{draftSavedAt ? ` (saved ${formatDraftSavedAt(draftSavedAt)})` : ""}.
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={discardDraft}
              data-testid="button-discard-draft"
            >
              Start fresh
            </Button>
          </div>
        )}
        {!draftRestored && draftSavedAt && (
          <div
            className="mb-3 text-xs text-muted-foreground"
            data-testid="text-draft-autosaved"
          >
            Draft auto-saved {formatDraftSavedAt(draftSavedAt)}
          </div>
        )}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <FormField
              control={form.control}
              name="requestType"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center gap-1.5">
                    <FormLabel>Request Type</FormLabel>
                    <HelpTooltip content="Select the type of request for this service order" />
                  </div>
                  <div className="space-y-2">
                    {[
                      { value: "authorization", label: "Authorization", desc: "Request approval for repairs or non-repairable determination" },
                      { value: "infestation_non_accessible", label: "Infestation / Non-Accessible", desc: "Unable to service due to infestation or access limitations" },
                      { value: "parts_nla", label: "Parts — No Longer Available (NLA)", desc: "Part is unavailable in TechHub. Submit for VRS parts team research. Sears Protect, Sears PA, and Sears Home Warranty (Cinch) calls only." },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        className={`w-full text-left p-3 rounded-md border transition-colors ${
                          field.value === opt.value
                            ? "border-primary bg-primary/5"
                            : "hover-elevate"
                        }`}
                        onClick={() => field.onChange(opt.value)}
                        data-testid={`tab-${opt.value.replace(/_/g, "-")}`}
                      >
                        <p className="text-sm font-medium">{opt.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                      </button>
                    ))}
                  </div>
                </FormItem>
              )}
            />

            {watchedRequestType === "parts_nla" &&
              watchedValues.warrantyType !== "american_home_shield" &&
              watchedValues.warrantyType !== "first_american" && (
              <div className="rounded-md border border-blue-200 bg-blue-50 dark:bg-blue-950 dark:border-blue-800 p-3" data-testid="nla-info-banner">
                <div className="flex items-start gap-2">
                  <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-blue-800 dark:text-blue-200">NLA Submissions Only</p>
                    <p className="text-sm text-blue-700 dark:text-blue-300 mt-0.5">
                      Submit this form ONLY when TechHub shows a part as "No Longer Available" for a Sears Protect (SPHW), Sears PA (MPA), or Sears Home Warranty (Cinch) service call. All other calls should be handled through TechHub directly.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {watchedRequestType === "parts_nla" &&
              (watchedValues.warrantyType === "american_home_shield" ||
                watchedValues.warrantyType === "first_american") && (
              <div
                className="rounded-md border border-destructive bg-destructive/10 p-3"
                data-testid="banner-nla-wrong-warranty"
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                  <div className="text-sm">
                    <p className="font-medium text-destructive">Use TechHub for AHS / First American NLA</p>
                    <p className="text-destructive/90 mt-0.5">
                      Handle AHS or First American NLA situations through TechHub — VRS does not route these to agents. Switch the request type to "Authorization" if this is a coverage approval question instead.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <Card>
              <CardContent className="p-4 space-y-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Technician Info</p>
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium">RAC ID</label>
                    <Input
                      value={user?.racId || ""}
                      disabled
                      className="mt-1"
                      data-testid="input-rac-id"
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone Number *</FormLabel>
                        <FormControl>
                          <Input placeholder="" {...field} data-testid="input-phone" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 space-y-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Appliance Details</p>
                <FormField
                  control={form.control}
                  name="serviceOrder"
                  render={({ field }) => {
                    const parts = (field.value || "").split("-");
                    const district = parts[0] || "";
                    const soNumber = parts[1] || "";
                    return (
                      <FormItem>
                        <FormLabel>Service Order *</FormLabel>
                        <div className="flex items-center gap-2">
                          <div className="space-y-1">
                            <p className="text-xs text-muted-foreground">District</p>
                            <Input
                              placeholder=""
                              value={district}
                              inputMode="numeric"
                              maxLength={4}
                              className="w-20 text-center"
                              data-testid="input-district"
                            onChange={(e) => {
                              const val = e.target.value.replace(/\D/g, "").slice(0, 4);
                              field.onChange(val + "-" + soNumber);
                              if (val.length === 4) {
                                soNumberRef.current?.focus();
                              }
                            }}
                          />
                          </div>
                          <span className="text-lg font-medium text-muted-foreground mt-5">-</span>
                          <div className="space-y-1 flex-1">
                            <p className="text-xs text-muted-foreground">Service Order #</p>
                            <Input
                              ref={soNumberRef}
                              placeholder=""
                              value={soNumber}
                              inputMode="numeric"
                              maxLength={8}
                              data-testid="input-service-order"
                              onChange={(e) => {
                                const val = e.target.value.replace(/\D/g, "").slice(0, 8);
                                field.onChange(district + "-" + val);
                              }}
                            />
                          </div>
                        </div>
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />
                <FormField
                  control={form.control}
                  name="applianceType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Appliance Type *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-appliance-type">
                            <SelectValue placeholder="Select appliance type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {APPLIANCE_TYPES.map((type) => (
                            <SelectItem key={type.value} value={type.value} data-testid={`option-${type.value}`}>
                              {type.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {watchedRequestType !== "parts_nla" && (
                  <div>
                    <div className="flex items-center gap-1.5">
                      <label className="text-sm font-medium">Warranty Provider</label>
                      <HelpTooltip content="The warranty provider is auto-detected from the service order's customer record. When auto-detected, the selection is locked. If detection cannot identify the provider, you can select it manually." />
                    </div>
                    {derivedWarranty ? (
                      <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1" data-testid="text-warranty-locked-note">
                        <Lock className="w-3 h-3" />
                        Auto-detected from service order — locked.
                      </p>
                    ) : warrantyLookup.isFetching ? (
                      <p className="mt-1 text-xs text-muted-foreground" data-testid="text-warranty-lookup-loading">
                        Looking up warranty provider from service order…
                      </p>
                    ) : isValidSo ? (
                      <p className="mt-1 text-xs text-muted-foreground" data-testid="text-warranty-autodetect-note">
                        Could not auto-detect — please select the warranty provider.
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-muted-foreground" data-testid="text-warranty-autodetect-note">
                        Will be auto-detected from the service order once entered.
                      </p>
                    )}
                    <div className="mt-2 space-y-2">
                      {WARRANTY_PROVIDERS.map((provider) => {
                        const isSelected = form.watch("warrantyType") === provider.value;
                        const isLocked = !!derivedWarranty;
                        const isClickable = provider.available && !isLocked;
                        return (
                          <div
                            key={provider.value}
                            className={`flex items-center justify-between gap-2 p-3 rounded-md border ${
                              isClickable
                                ? "cursor-pointer hover-elevate"
                                : "cursor-not-allowed"
                            } ${
                              isLocked && !isSelected ? "opacity-50" : ""
                            } ${
                              !provider.available ? "opacity-60" : ""
                            } ${
                              isSelected ? "border-primary bg-primary/5" : ""
                            }`}
                            onClick={() => {
                              if (isClickable) {
                                form.setValue("warrantyType", provider.value as any);
                                form.setValue("warrantyProvider", provider.label);
                              }
                            }}
                            data-testid={`provider-${provider.value}`}
                            aria-disabled={!isClickable}
                          >
                            <span className="text-sm">{provider.label}</span>
                            <div className="flex items-center gap-1">
                              {isLocked && isSelected && (
                                <Badge variant="secondary" className="text-xs" data-testid={`badge-locked-${provider.value}`}>
                                  <Lock className="w-3 h-3 mr-1" />
                                  Auto-detected
                                </Badge>
                              )}
                              {!provider.available && (
                                <Badge variant="secondary" className="text-xs" data-testid={`badge-coming-soon-${provider.value}`}>
                                  <Lock className="w-3 h-3 mr-1" />
                                  Coming Soon
                                </Badge>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 space-y-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Issue Details</p>
                <FormField
                  control={form.control}
                  name="issueDescription"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{watchedRequestType === "parts_nla" ? "Issue Description: Why are the parts needed? *" : "Issue Description *"}</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder={watchedRequestType === "parts_nla" ? "Explain why the part is needed and what failed on the unit..." : watchedRequestType === "authorization" ? "Describe the issue and required repair. For non-repairable units, explain why the unit cannot be repaired." : "Describe the issue..."}
                          className="min-h-[100px]"
                          maxLength={2000}
                          {...field}
                          onChange={(e) => {
                            field.onChange(e);
                            if (aiUsed) setAiEdited(true);
                          }}
                          data-testid="input-issue-description"
                          disabled={aiEnhanceMutation.isPending}
                        />
                      </FormControl>
                      {aiUsed && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Sparkles className="w-3 h-3" />
                          {aiEdited ? "AI-enhanced (edited)" : "AI-enhanced"}
                        </p>
                      )}
                      <p className={`text-xs ${descriptionLength >= 20 ? "text-green-600" : "text-muted-foreground"}`} data-testid="text-char-count">
                        {descriptionLength}/20 minimum {descriptionLength >= 20 ? "✓" : ""}
                      </p>
                      <div className="flex items-center gap-2 pt-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={aiButtonDisabled}
                          onClick={() => {
                            const desc = form.getValues("issueDescription");
                            const appliance = form.getValues("applianceType") || "appliance";
                            if (!desc || desc.length < 20) return;
                            const seen = localStorage.getItem("ai_tooltip_seen");
                            if (!seen) {
                              localStorage.setItem("ai_tooltip_seen", "true");
                              toast({
                                title: "Experimental Feature",
                                description: "This AI tool helps clarify your description without changing the meaning. Always review the result before submitting.",
                              });
                            }
                            aiEnhanceMutation.mutate({
                              description: desc,
                              applianceType: appliance,
                            });
                          }}
                          data-testid="button-ai-enhance"
                        >
                          {aiEnhanceMutation.isPending ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                              Improving...
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                              Improve with AI
                            </>
                          )}
                        </Button>
                        <Badge variant="secondary" className="text-xs">Experimental</Badge>
                      </div>
                      {aiPreview && (
                        <div className="mt-3 space-y-2">
                          <p className="text-xs font-medium text-muted-foreground">AI-Improved Version (review and edit as needed)</p>
                          <div className="p-3 rounded-md border bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 text-sm whitespace-pre-wrap" data-testid="text-ai-preview">
                            {aiPreview}
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => {
                                field.onChange(aiPreview);
                                setAiUsed(true);
                                setAiEdited(false);
                                setAiPreview(null);
                              }}
                              data-testid="button-ai-use"
                            >
                              Use This
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setAiPreview(null);
                                setOriginalBeforeAi(null);
                              }}
                              data-testid="button-ai-keep-original"
                            >
                              Keep Original
                            </Button>
                          </div>
                        </div>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />

              </CardContent>
            </Card>

            {watchedRequestType === "parts_nla" && (
              <>
                <Card>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        NLA Part Number(s) <span className="text-destructive">*</span>
                      </p>
                      <HelpTooltip content="Enter part numbers that are No Longer Available in TechHub. These are the parts VRS will research." />
                    </div>
                    <p className="text-sm text-muted-foreground">Parts showing unavailable / discontinued in TechHub</p>
                    <div className="space-y-2">
                      {partNumbers.map((pn, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <Input
                            placeholder="Enter NLA part number (e.g., WPW10321304)"
                            value={pn}
                            onChange={(e) => {
                              const updated = [...partNumbers];
                              updated[idx] = e.target.value.toUpperCase();
                              setPartNumbers(updated);
                            }}
                            data-testid={`input-part-number-${idx}`}
                          />
                          {partNumbers.length > 1 && (
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-destructive hover:text-destructive shrink-0"
                              onClick={() => setPartNumbers(partNumbers.filter((_, i) => i !== idx))}
                              data-testid={`button-remove-part-${idx}`}
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between">
                      {partNumbers.length < 10 && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setPartNumbers([...partNumbers, ""])}
                          data-testid="button-add-part-number"
                        >
                          <Plus className="w-3.5 h-3.5 mr-1.5" />
                          Add NLA Part
                        </Button>
                      )}
                      <p className="text-xs text-muted-foreground ml-auto">{partNumbers.filter(p => p.trim() !== "").length}/10 parts</p>
                    </div>
                    {partNumbers.every(p => p.trim() === "") && availableParts.every(p => p.trim() === "") && (
                      <p className="text-sm text-destructive" data-testid="text-part-number-error">At least one part number is required</p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Other Required Parts (Available)
                      </p>
                      <HelpTooltip content="Enter part numbers that ARE available in TechHub but are also needed for this repair. These parts stay on the order if the NLA part is not found." />
                    </div>
                    <p className="text-sm text-muted-foreground">Parts showing available in TechHub that must remain on the order</p>
                    {availableParts.length > 0 && (
                      <div className="space-y-2">
                        {availableParts.map((pn, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <Input
                              placeholder="Enter available part number"
                              value={pn}
                              onChange={(e) => {
                                const updated = [...availableParts];
                                updated[idx] = e.target.value.toUpperCase();
                                setAvailableParts(updated);
                              }}
                              data-testid={`input-available-part-${idx}`}
                            />
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-destructive hover:text-destructive shrink-0"
                              onClick={() => setAvailableParts(availableParts.filter((_, i) => i !== idx))}
                              data-testid={`button-remove-available-part-${idx}`}
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      {availableParts.length < 10 && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setAvailableParts([...availableParts, ""])}
                          data-testid="button-add-available-part"
                        >
                          <Plus className="w-3.5 h-3.5 mr-1.5" />
                          Add Available Part
                        </Button>
                      )}
                      {availableParts.length > 0 && (
                        <p className="text-xs text-muted-foreground ml-auto">{availableParts.filter(p => p.trim() !== "").length}/10 parts</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </>
            )}

            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Issue Photos <span className="text-destructive">*</span>
                  </p>
                  <HelpTooltip content={
                    watchedRequestType === "infestation_non_accessible"
                      ? "You must upload clear photos documenting the infestation or unsafe conditions. These are required for claim review."
                      : "Photos showing the issue, diagnosis, defective parts, error codes, damage."
                  } />
                </div>
                <p className="text-sm text-muted-foreground">Photos showing the issue, diagnosis, defective parts, error codes, damage</p>
                {watchedRequestType === "infestation_non_accessible" && (
                  <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 space-y-2" data-testid="infestation-photo-requirements">
                    <p className="text-sm font-medium text-destructive">Photo evidence is required. Document the following:</p>
                    <ul className="text-sm text-muted-foreground space-y-1.5 list-none">
                      <li className="flex items-start gap-2"><AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" /><span>Roaches, insects, or pest activity</span></li>
                      <li className="flex items-start gap-2"><AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" /><span>Mouse or rodent droppings</span></li>
                      <li className="flex items-start gap-2"><AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" /><span>Mold, biohazard, or unsanitary conditions</span></li>
                      <li className="flex items-start gap-2"><AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" /><span>Blocked or unsafe access to the appliance</span></li>
                    </ul>
                  </div>
                )}
                <input
                  ref={issuePhotoInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  capture={undefined}
                  className="hidden"
                  onChange={(e) => handlePhotosSelect(e.target.files, issuePhotoUrls, setIssuePhotoUrls, setIssuePhotoUploading, setIssuePhotoUploadCount, 15, issuePhotoInputRef, setIssuePhotoLocalPreviews)}
                  data-testid="input-issue-photo-file"
                />
                {issuePhotoUrls.length > 0 && (
                  <div className="grid grid-cols-3 gap-2" data-testid="issue-photo-previews">
                    {issuePhotoUrls.map((url, i) => (
                      <div key={i} className="relative aspect-square bg-muted rounded-md overflow-visible">
                        <img
                          src={issuePhotoLocalPreviews[url] || url}
                          alt={`Issue ${i + 1}`}
                          className="w-full h-full object-cover rounded-md"
                          data-testid={`img-issue-preview-${i}`}
                          onError={(e) => { const t = e.currentTarget; if (t.src !== url) { t.src = url; } else { t.style.display = "none"; t.parentElement!.classList.add("flex", "items-center", "justify-center"); const s = document.createElement("span"); s.className = "text-xs text-muted-foreground"; s.textContent = `Photo ${i + 1}`; t.parentElement!.appendChild(s); } }}
                        />
                        <Button type="button" size="icon" variant="destructive" className="absolute -top-2 -right-2 h-6 w-6" onClick={() => { const blobUrl = issuePhotoLocalPreviews[url]; if (blobUrl) URL.revokeObjectURL(blobUrl); setIssuePhotoLocalPreviews((prev) => { const n = {...prev}; delete n[url]; return n; }); setIssuePhotoUrls((prev) => prev.filter((_, idx) => idx !== i)); }} data-testid={`button-remove-issue-${i}`}>
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                {failedUploads.filter((f) => f.category === "issue").length > 0 && (
                  <div className="mt-3 space-y-2" data-testid="failed-uploads-issue">
                    {failedUploads
                      .filter((f) => f.category === "issue")
                      .map((f) => (
                        <div
                          key={f.id}
                          className="flex items-center justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-sm"
                          data-testid={`failed-upload-issue-${f.id}`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-medium">{f.file.name}</div>
                            <div className="text-xs text-muted-foreground">{f.lastError}</div>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={retryingIds.has(f.id)}
                            onClick={() => retryFailedUpload(f.id)}
                            data-testid={`button-retry-issue-${f.id}`}
                          >
                            {retryingIds.has(f.id) ? <Loader2 className="w-3 h-3 animate-spin" /> : "Retry"}
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            disabled={retryingIds.has(f.id)}
                            onClick={() => dismissFailedUpload(f.id)}
                            data-testid={`button-dismiss-issue-${f.id}`}
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      ))}
                  </div>
                )}
                {issuePhotoUploading && (
                  <div className="flex items-center justify-center gap-2 py-3" data-testid="issue-photo-uploading">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm text-muted-foreground">Uploading {issuePhotoUploadCount.done}/{issuePhotoUploadCount.total} photos...</span>
                  </div>
                )}
                {issuePhotoUrls.length < 15 && !issuePhotoUploading && (
                  <div className="border-2 border-dashed rounded-md p-6 text-center cursor-pointer hover-elevate" onClick={() => issuePhotoInputRef.current?.click()} data-testid="button-add-issue-photos">
                    <Camera className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">{issuePhotoUrls.length === 0 ? "Tap to add issue photos" : "Tap to add more issue photos"}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{issuePhotoUrls.length}/15 photos</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {watchedRequestType === "infestation_non_accessible"
                      ? <>Model / Serial Tag Photo <span className="text-destructive">*</span></>
                      : <>Model, Serial &amp; Estimate Screenshots <span className="text-destructive">*</span></>
                    }
                  </p>
                  <HelpTooltip content={
                    watchedRequestType === "infestation_non_accessible"
                      ? "Take a clear photo of the model/serial number tag on the appliance."
                      : "Model/serial plate and TechHub estimate screenshots showing part numbers, costs, labor, tax, and total."
                  } />
                </div>
                <p className="text-sm text-muted-foreground">
                  {watchedRequestType === "infestation_non_accessible"
                    ? "Clear photo of the model/serial number tag on the appliance"
                    : "Model/serial plate and TechHub estimate screenshots"}
                </p>
                  <input
                    ref={estimatePhotoInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    capture={undefined}
                    className="hidden"
                    onChange={(e) => handlePhotosSelect(e.target.files, estimatePhotoUrls, setEstimatePhotoUrls, setEstimatePhotoUploading, setEstimatePhotoUploadCount, 5, estimatePhotoInputRef, setEstimatePhotoLocalPreviews)}
                    data-testid="input-estimate-photo-file"
                  />
                  {estimatePhotoUrls.length > 0 && (
                    <div className="grid grid-cols-3 gap-2" data-testid="estimate-photo-previews">
                      {estimatePhotoUrls.map((url, i) => (
                        <div key={i} className="relative aspect-square bg-muted rounded-md overflow-visible">
                          <img
                            src={estimatePhotoLocalPreviews[url] || url}
                            alt={`Estimate ${i + 1}`}
                            className="w-full h-full object-cover rounded-md"
                            data-testid={`img-estimate-preview-${i}`}
                            onError={(e) => { const t = e.currentTarget; if (t.src !== url) { t.src = url; } else { t.style.display = "none"; t.parentElement!.classList.add("flex", "items-center", "justify-center"); const s = document.createElement("span"); s.className = "text-xs text-muted-foreground"; s.textContent = `Estimate ${i + 1}`; t.parentElement!.appendChild(s); } }}
                          />
                          <Button type="button" size="icon" variant="destructive" className="absolute -top-2 -right-2 h-6 w-6" onClick={() => { const blobUrl = estimatePhotoLocalPreviews[url]; if (blobUrl) URL.revokeObjectURL(blobUrl); setEstimatePhotoLocalPreviews((prev) => { const n = {...prev}; delete n[url]; return n; }); setEstimatePhotoUrls((prev) => prev.filter((_, idx) => idx !== i)); }} data-testid={`button-remove-estimate-${i}`}>
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  {failedUploads.filter((f) => f.category === "estimate").length > 0 && (
                    <div className="mt-3 space-y-2" data-testid="failed-uploads-estimate">
                      {failedUploads
                        .filter((f) => f.category === "estimate")
                        .map((f) => (
                          <div
                            key={f.id}
                            className="flex items-center justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-sm"
                            data-testid={`failed-upload-estimate-${f.id}`}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="truncate font-medium">{f.file.name}</div>
                              <div className="text-xs text-muted-foreground">{f.lastError}</div>
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={retryingIds.has(f.id)}
                              onClick={() => retryFailedUpload(f.id)}
                              data-testid={`button-retry-estimate-${f.id}`}
                            >
                              {retryingIds.has(f.id) ? <Loader2 className="w-3 h-3 animate-spin" /> : "Retry"}
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              disabled={retryingIds.has(f.id)}
                              onClick={() => dismissFailedUpload(f.id)}
                              data-testid={`button-dismiss-estimate-${f.id}`}
                            >
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                        ))}
                    </div>
                  )}
                  {estimatePhotoUploading && (
                    <div className="flex items-center justify-center gap-2 py-3" data-testid="estimate-photo-uploading">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="text-sm text-muted-foreground">Uploading {estimatePhotoUploadCount.done}/{estimatePhotoUploadCount.total} photos...</span>
                    </div>
                  )}
                  {estimatePhotoUrls.length < 5 && !estimatePhotoUploading && (
                    <div className="border-2 border-dashed rounded-md p-6 text-center cursor-pointer hover-elevate" onClick={() => estimatePhotoInputRef.current?.click()} data-testid="button-add-estimate-photos">
                      <Camera className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">{estimatePhotoUrls.length === 0 ? "Tap to add photos" : "Tap to add more photos"}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{estimatePhotoUrls.length}/5 photos</p>
                    </div>
                  )}
                </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Video Upload</p>
                <input
                  ref={videoInputRef}
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={handleVideoSelect}
                  data-testid="input-video-file"
                />
                {!videoUrl && !isUploading && !isConverting && (
                  <label
                    className="border-2 border-dashed rounded-md p-6 text-center block cursor-pointer"
                    data-testid="button-add-video"
                    onClick={() => videoInputRef.current?.click()}
                  >
                    <Video className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Tap to add video</p>
                    <p className="text-xs text-muted-foreground mt-1">Max 50MB file size</p>
                  </label>
                )}
                {videoError && (
                  <p className="text-sm text-destructive" data-testid="text-video-error">{videoError}</p>
                )}
                {isUploading && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <Progress value={uploadProgress} className="flex-1" data-testid="progress-video-upload" />
                      <span className="text-sm text-muted-foreground whitespace-nowrap">{uploadProgress}%</span>
                    </div>
                    <p className="text-xs text-muted-foreground text-center">Uploading video...</p>
                  </div>
                )}
                {isConverting && (
                  <div className="space-y-2" data-testid="video-converting">
                    <div className="flex items-center justify-center gap-2 py-3">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="text-sm text-muted-foreground">Converting video for playback...</span>
                    </div>
                  </div>
                )}
                {videoUrl && !isUploading && (
                  <div className="relative">
                    <video
                      src={videoUrl}
                      controls
                      className="w-full rounded-md"
                      data-testid="video-preview"
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="destructive"
                      className="absolute top-2 right-2"
                      onClick={removeVideo}
                      data-testid="button-remove-video"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Voice Note</p>
                <input
                  ref={audioFileInputRef}
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={handleAudioFileSelect}
                  data-testid="input-audio-file"
                />
                {!voiceNoteUrl && !isRecording && !audioUploading && (
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1"
                      onClick={startRecording}
                      data-testid="button-start-recording"
                    >
                      <Mic className="w-4 h-4 mr-2" />
                      Record
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1"
                      onClick={() => audioFileInputRef.current?.click()}
                      data-testid="button-upload-audio"
                    >
                      <Send className="w-4 h-4 mr-2" />
                      Upload File
                    </Button>
                  </div>
                )}
                {isRecording && (
                  <div className="flex items-center gap-3 p-3 rounded-md border border-destructive/30 bg-destructive/5" data-testid="recording-active">
                    <div className="w-3 h-3 rounded-full bg-destructive animate-pulse" />
                    <span className="text-sm font-medium flex-1">Recording... {formatDuration(recordingDuration)}</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      onClick={stopRecording}
                      data-testid="button-stop-recording"
                    >
                      <MicOff className="w-4 h-4 mr-1" />
                      Stop
                    </Button>
                  </div>
                )}
                {audioUploading && (
                  <div className="flex items-center justify-center gap-2 py-3" data-testid="audio-uploading">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm text-muted-foreground">Uploading audio...</span>
                  </div>
                )}
                {voiceNoteUrl && !audioUploading && (
                  <div className="space-y-2" data-testid="voice-note-preview">
                    <audio src={voiceNoteUrl} controls className="w-full" data-testid="audio-player-preview" />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={removeVoiceNote}
                      data-testid="button-remove-voice-note"
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                      Remove Voice Note
                    </Button>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">Record up to 2 minutes or upload an audio file (max 10MB)</p>
              </CardContent>
            </Card>

            {issuePhotoUrls.length === 0 && !issuePhotoUploading && (
              <p className="text-sm text-destructive" data-testid="text-issue-photo-error">
                Please upload at least one issue photo
              </p>
            )}
            {estimatePhotoUrls.length === 0 && !estimatePhotoUploading && (
              <p className="text-sm text-destructive" data-testid="text-estimate-photo-error">
                {watchedRequestType === "infestation_non_accessible"
                  ? "Please upload a model/serial tag photo"
                  : "Please upload at least one model/serial & estimate screenshot"}
              </p>
            )}

            <Button
              type="submit"
              className="w-full"
              size="lg"
              disabled={mutation.isPending || estimatePhotoUploading || issuePhotoUploading || isUploading || isConverting || audioUploading || issuePhotoUrls.length === 0 || estimatePhotoUrls.length === 0 || (watchedRequestType === "parts_nla" && partNumbers.every(p => p.trim() === "") && availableParts.every(p => p.trim() === ""))}
              data-testid="button-submit-form"
            >
              <Send className="w-4 h-4 mr-2" />
              {mutation.isPending ? "Submitting..." : estimatePhotoUploading || issuePhotoUploading ? "Uploading Photos..." : isUploading ? "Uploading Video..." : isConverting ? "Converting Video..." : audioUploading ? "Uploading Audio..." : watchedRequestType === "parts_nla" ? "Submit NLA Request" : "Submit for Review"}
            </Button>
          </form>
        </Form>
      </div>
    </div>
  );
}
