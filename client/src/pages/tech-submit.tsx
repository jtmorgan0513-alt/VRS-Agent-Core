import { useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
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
import { Camera, Send, Lock, Video, X, Sparkles, Loader2, AlertTriangle, Square, Mic, MicOff, Trash2 } from "lucide-react";
import HelpTooltip from "@/components/help-tooltip";

const APPLIANCE_TYPES = [
  { value: "refrigeration", label: "Refrigerator" },
  { value: "laundry", label: "Laundry" },
  { value: "cooking", label: "Cooking" },
  { value: "dishwasher", label: "Dishwasher" },
  { value: "microwave", label: "Microwave" },
  { value: "hvac", label: "HVAC" },
  { value: "all_other", label: "All Other" },
];

const WARRANTY_PROVIDERS = [
  { value: "sears_protect", label: "Sears Protect / Sears PA / Sears Home Warranty (Cinch)", available: true },
  { value: "american_home_shield", label: "American Home Shield", available: false },
  { value: "first_american", label: "First American", available: false },
];

const submissionFormSchema = z.object({
  serviceOrder: z.string().regex(/^\d{4}-\d{8}$/, "Service order must be in format DDDD-SSSSSSSS (e.g., 8175-12345678)"),
  phone: z.string().min(7, "Valid phone number is required"),
  applianceType: z.enum(["cooking", "dishwasher", "microwave", "laundry", "refrigeration", "hvac", "all_other"], {
    required_error: "Select an appliance type",
  }),
  requestType: z.enum(["authorization", "infestation_non_accessible"]),
  warrantyType: z.enum(["sears_protect"]).default("sears_protect"),
  warrantyProvider: z.string().optional(),
  issueDescription: z.string().min(10, "Please provide at least 10 characters").max(2000, "Description must be 2000 characters or less"),
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

  async function uploadSinglePhoto(file: File): Promise<string | null> {
    const token = getToken();
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
      if (!urlRes.ok) throw new Error("Failed to get upload URL");
      const { uploadURL, objectPath } = await urlRes.json();

      return new Promise((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(objectPath);
          } else {
            resolve(null);
          }
        });
        xhr.addEventListener("error", () => resolve(null));
        xhr.open("PUT", uploadURL);
        xhr.setRequestHeader("Content-Type", file.type);
        xhr.send(file);
      });
    } catch {
      return null;
    }
  }

  async function handlePhotosSelect(
    files: FileList | null,
    currentUrls: string[],
    setUrls: React.Dispatch<React.SetStateAction<string[]>>,
    setUploading: React.Dispatch<React.SetStateAction<boolean>>,
    setCount: React.Dispatch<React.SetStateAction<{ done: number; total: number }>>,
    maxPhotos: number,
    inputRef: React.RefObject<HTMLInputElement | null>,
  ) {
    if (!files || files.length === 0) return;
    const validFiles = Array.from(files).filter((f) => f.size <= 20 * 1024 * 1024 && f.type.startsWith("image/"));
    if (validFiles.length === 0) {
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
    for (let i = 0; i < filesToUpload.length; i++) {
      const url = await uploadSinglePhoto(filesToUpload[i]);
      if (url) newUrls.push(url);
      setCount({ done: i + 1, total: filesToUpload.length });
    }
    setUrls((prev) => [...prev, ...newUrls]);
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
    if (newUrls.length < filesToUpload.length) {
      toast({ title: "Some Photos Failed", description: `${filesToUpload.length - newUrls.length} photo(s) failed to upload.`, variant: "destructive" });
    }
  }

  function handleVideoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setVideoError(null);

    if (file.size > 50 * 1024 * 1024) {
      setVideoError("Video file exceeds 50MB limit");
      if (videoInputRef.current) videoInputRef.current.value = "";
      return;
    }

    const isMov = /\.(mov)$/i.test(file.name) || file.type === "video/quicktime";

    if (isMov) {
      uploadVideo(file);
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
      return data.objectPath;
    } catch {
      return objectPath;
    } finally {
      setIsConverting(false);
    }
  }

  function needsConversion(file: File): boolean {
    const name = file.name.toLowerCase();
    return name.endsWith(".mov") || file.type === "video/quicktime" || file.type === "video/x-m4v";
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

  async function uploadAudioFile(file: File) {
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "File Too Large", description: "Audio file must be under 10MB.", variant: "destructive" });
      return;
    }
    setAudioUploading(true);
    const url = await uploadSinglePhoto(file);
    setAudioUploading(false);
    if (url) {
      setVoiceNoteUrl(url);
    } else {
      toast({ title: "Upload Failed", description: "Failed to upload audio file.", variant: "destructive" });
    }
  }

  function handleAudioFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("audio/")) {
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
      warrantyProvider: "",
      issueDescription: "",
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: SubmissionFormData & { originalDescription?: string; aiEnhanced?: boolean }) => {
      const res = await apiRequest("POST", "/api/submissions", data);
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/submissions"] });
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
    const payload: any = { ...data };
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
    mutation.mutate(payload as any);
  }

  const watchedRequestType = form.watch("requestType");
  const watchedValues = form.watch();
  const descriptionLength = watchedValues.issueDescription?.length || 0;
  const aiButtonDisabled = descriptionLength < 20 || aiEnhanceMutation.isPending;

  return (
    <div className="min-h-screen pb-20">
      <div className="bg-primary text-primary-foreground p-4">
        <div className="max-w-lg mx-auto">
          <h1 className="text-lg font-bold" data-testid="text-submit-title">VRS Submission</h1>
          <p className="text-sm opacity-80">New Authorization Request</p>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4">
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
                          <Input placeholder="(555) 555-0147" {...field} data-testid="input-phone" />
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
                              placeholder="8175"
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
                              placeholder="12345678"
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

                <div>
                  <div className="flex items-center gap-1.5">
                    <label className="text-sm font-medium">Warranty Provider *</label>
                    <HelpTooltip content="Select Sears Protect. B2B providers coming soon." />
                  </div>
                  <div className="mt-2 space-y-2">
                    {WARRANTY_PROVIDERS.map((provider) => (
                      <div
                        key={provider.value}
                        className={`flex items-center justify-between gap-2 p-3 rounded-md border ${
                          provider.available
                            ? "cursor-pointer hover-elevate"
                            : "opacity-60 cursor-not-allowed"
                        } ${
                          form.watch("warrantyType") === "sears_protect" && provider.value === "sears_protect"
                            ? "border-primary bg-primary/5"
                            : ""
                        }`}
                        onClick={() => {
                          if (provider.available) {
                            form.setValue("warrantyType", "sears_protect");
                          }
                        }}
                        data-testid={`provider-${provider.value}`}
                      >
                        <span className="text-sm">{provider.label}</span>
                        {!provider.available && (
                          <Badge variant="secondary" className="text-xs" data-testid={`badge-coming-soon-${provider.value}`}>
                            <Lock className="w-3 h-3 mr-1" />
                            Coming Soon
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
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
                      <FormLabel>Issue Description *</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder={watchedRequestType === "authorization" ? "Describe the issue and required repair. For non-repairable units, explain why the unit cannot be repaired." : "Describe the issue..."}
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

            {watchedRequestType === "authorization" && (
              <Card>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      TechHub Estimate Screenshot(s) <span className="text-destructive">*</span>
                    </p>
                    <HelpTooltip content="Upload photos of your TechHub estimate screen showing part numbers, costs, labor, tax, and total." />
                  </div>
                  <p className="text-sm text-muted-foreground">Upload photos of your TechHub estimate screen showing:</p>
                  <ul className="text-sm text-muted-foreground space-y-1 list-none">
                    <li className="flex items-center gap-2"><Square className="w-3.5 h-3.5 shrink-0" /><span>Part numbers visible</span></li>
                    <li className="flex items-center gap-2"><Square className="w-3.5 h-3.5 shrink-0" /><span>Part costs visible</span></li>
                    <li className="flex items-center gap-2"><Square className="w-3.5 h-3.5 shrink-0" /><span>Labor costs visible</span></li>
                    <li className="flex items-center gap-2"><Square className="w-3.5 h-3.5 shrink-0" /><span>Tax visible</span></li>
                    <li className="flex items-center gap-2"><Square className="w-3.5 h-3.5 shrink-0" /><span>Total visible</span></li>
                  </ul>
                  <input
                    ref={estimatePhotoInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    capture={undefined}
                    className="hidden"
                    onChange={(e) => handlePhotosSelect(e.target.files, estimatePhotoUrls, setEstimatePhotoUrls, setEstimatePhotoUploading, setEstimatePhotoUploadCount, 5, estimatePhotoInputRef)}
                    data-testid="input-estimate-photo-file"
                  />
                  {estimatePhotoUrls.length > 0 && (
                    <div className="grid grid-cols-3 gap-2" data-testid="estimate-photo-previews">
                      {estimatePhotoUrls.map((url, i) => (
                        <div key={i} className="relative aspect-square bg-muted rounded-md overflow-visible">
                          <img src={url} alt={`Estimate ${i + 1}`} className="w-full h-full object-cover rounded-md" data-testid={`img-estimate-preview-${i}`} />
                          <Button type="button" size="icon" variant="destructive" className="absolute -top-2 -right-2 h-6 w-6" onClick={() => setEstimatePhotoUrls((prev) => prev.filter((_, idx) => idx !== i))} data-testid={`button-remove-estimate-${i}`}>
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
                      <p className="text-sm text-muted-foreground">{estimatePhotoUrls.length === 0 ? "Tap to add estimate photos" : "Tap to add more estimate photos"}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{estimatePhotoUrls.length}/5 photos</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Model/Serial &amp; Issue Photos {watchedRequestType === "infestation_non_accessible" && <span className="text-destructive">*</span>}
                  </p>
                  <HelpTooltip content={
                    watchedRequestType === "infestation_non_accessible"
                      ? "You must upload clear photos documenting the infestation or unsafe conditions. These are required for claim review."
                      : "Upload clear photos of the appliance issue, model/serial tags, and any relevant documentation."
                  } />
                </div>
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
                  onChange={(e) => handlePhotosSelect(e.target.files, issuePhotoUrls, setIssuePhotoUrls, setIssuePhotoUploading, setIssuePhotoUploadCount, 10, issuePhotoInputRef)}
                  data-testid="input-issue-photo-file"
                />
                {issuePhotoUrls.length > 0 && (
                  <div className="grid grid-cols-3 gap-2" data-testid="issue-photo-previews">
                    {issuePhotoUrls.map((url, i) => (
                      <div key={i} className="relative aspect-square bg-muted rounded-md overflow-visible">
                        <img src={url} alt={`Issue ${i + 1}`} className="w-full h-full object-cover rounded-md" data-testid={`img-issue-preview-${i}`} />
                        <Button type="button" size="icon" variant="destructive" className="absolute -top-2 -right-2 h-6 w-6" onClick={() => setIssuePhotoUrls((prev) => prev.filter((_, idx) => idx !== i))} data-testid={`button-remove-issue-${i}`}>
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
                {issuePhotoUrls.length < 10 && !issuePhotoUploading && (
                  <div className="border-2 border-dashed rounded-md p-6 text-center cursor-pointer hover-elevate" onClick={() => issuePhotoInputRef.current?.click()} data-testid="button-add-issue-photos">
                    <Camera className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">{issuePhotoUrls.length === 0 ? "Tap to add photos" : "Tap to add more photos"}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {watchedRequestType === "infestation_non_accessible"
                        ? "Infestation evidence, unsafe conditions, appliance area"
                        : "Model/serial plate, error codes, damage, defective parts"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">{issuePhotoUrls.length}/10 photos</p>
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
                  accept="video/mp4,video/quicktime,video/webm"
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

            {watchedRequestType === "authorization" && estimatePhotoUrls.length === 0 && !estimatePhotoUploading && (
              <p className="text-sm text-destructive" data-testid="text-estimate-photo-error">
                Please upload at least one photo of your TechHub estimate screen
              </p>
            )}

            <Button
              type="submit"
              className="w-full"
              size="lg"
              disabled={mutation.isPending || estimatePhotoUploading || issuePhotoUploading || isUploading || isConverting || audioUploading || (watchedRequestType === "authorization" && estimatePhotoUrls.length === 0)}
              data-testid="button-submit-form"
            >
              <Send className="w-4 h-4 mr-2" />
              {mutation.isPending ? "Submitting..." : estimatePhotoUploading || issuePhotoUploading ? "Uploading Photos..." : isUploading ? "Uploading Video..." : isConverting ? "Converting Video..." : audioUploading ? "Uploading Audio..." : "Submit for Review"}
            </Button>
          </form>
        </Form>
      </div>
    </div>
  );
}
