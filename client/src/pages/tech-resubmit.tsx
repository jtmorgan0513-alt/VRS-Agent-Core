import { useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation, Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth, getToken } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import { Camera, Send, X, AlertTriangle, ArrowLeft, Lock, Video, Upload } from "lucide-react";
import type { Submission } from "@shared/schema";

const APPLIANCE_TYPES = [
  { value: "refrigeration", label: "Refrigerator" },
  { value: "laundry", label: "Laundry" },
  { value: "cooking", label: "Cooking" },
  { value: "dishwasher", label: "Dishwasher" },
  { value: "microwave", label: "Microwave" },
  { value: "hvac", label: "HVAC" },
  { value: "all_other", label: "All Other" },
];

const resubmitFormSchema = z.object({
  serviceOrder: z.string(),
  phone: z.string().min(7, "Valid phone number is required"),
  applianceType: z.enum(["cooking", "dishwasher", "microwave", "laundry", "refrigeration", "hvac", "all_other"], {
    required_error: "Select an appliance type",
  }),
  requestType: z.enum(["authorization", "infestation_non_accessible"]),
  warrantyType: z.enum(["sears_protect"]).default("sears_protect"),
  warrantyProvider: z.string().optional(),
  issueDescription: z.string().min(10, "Please provide at least 10 characters").max(2000, "Description must be 2000 characters or less"),
  appealNotes: z.string().max(2000, "Appeal notes must be 2000 characters or less").optional(),
});

type ResubmitFormData = z.infer<typeof resubmitFormSchema>;

export default function TechResubmitPage() {
  const [, params] = useRoute("/tech/resubmit/:id");
  const originalId = params?.id ? parseInt(params.id) : null;
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [issuePhotoUrls, setIssuePhotoUrls] = useState<string[]>([]);
  const [estimatePhotoUrls, setEstimatePhotoUrls] = useState<string[]>([]);
  const [issuePhotoUploading, setIssuePhotoUploading] = useState(false);
  const [estimatePhotoUploading, setEstimatePhotoUploading] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoUploading, setVideoUploading] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const issuePhotoInputRef = useRef<HTMLInputElement>(null);
  const estimatePhotoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<ResubmitFormData>({
    resolver: zodResolver(resubmitFormSchema),
    defaultValues: {
      serviceOrder: "",
      phone: "",
      applianceType: undefined,
      requestType: "authorization",
      warrantyType: "sears_protect",
      warrantyProvider: "",
      issueDescription: "",
      appealNotes: "",
    },
  });

  const { data, isLoading, error } = useQuery<{ submission: Submission }>({
    queryKey: ["/api/submissions", originalId],
    enabled: !!originalId,
  });

  const historyQuery = useQuery<{
    history: Submission[];
    reviewerNames: Record<number, string>;
    technicianName: string;
    resubmissionCount: number;
    maxResubmissions: number;
  }>({
    queryKey: ["/api/submissions", originalId, "history"],
    enabled: !!originalId,
  });

  if (data?.submission && !initialized) {
    const sub = data.submission;
    form.reset({
      serviceOrder: sub.serviceOrder,
      phone: sub.phone,
      applianceType: sub.applianceType as any,
      requestType: sub.requestType as any,
      warrantyType: sub.warrantyType as any,
      warrantyProvider: sub.warrantyProvider || "",
      issueDescription: sub.issueDescription,
      appealNotes: "",
    });
    let rejMedia: any = null;
    try { rejMedia = sub.rejectedMedia ? JSON.parse(sub.rejectedMedia) : null; } catch {}
    const rejectedPhotoUrls = new Set((rejMedia?.photos || []).map((p: any) => p.url));
    const isVideoRejected = rejMedia?.video?.rejected === true;

    try {
      const parsed = sub.photos ? JSON.parse(sub.photos) : null;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        if (parsed.issue) setIssuePhotoUrls(parsed.issue.filter((url: string) => !rejectedPhotoUrls.has(url)));
        if (parsed.estimate) setEstimatePhotoUrls(parsed.estimate.filter((url: string) => !rejectedPhotoUrls.has(url)));
      } else if (Array.isArray(parsed)) {
        setIssuePhotoUrls(parsed.filter((url: string) => !rejectedPhotoUrls.has(url)));
      }
    } catch {}
    if (sub.videoUrl && !isVideoRejected) setVideoUrl(sub.videoUrl);
    setInitialized(true);
  }

  async function uploadSingleFile(file: File): Promise<string | null> {
    const token = getToken();
    try {
      const urlRes = await fetch("/api/uploads/request-url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      if (!urlRes.ok) throw new Error("Failed to get upload URL");
      const { uploadURL, objectPath } = await urlRes.json();
      return new Promise((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.addEventListener("load", () => {
          resolve(xhr.status >= 200 && xhr.status < 300 ? objectPath : null);
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
    setUploading(true);
    const newUrls: string[] = [];
    for (const file of filesToUpload) {
      const url = await uploadSingleFile(file);
      if (url) newUrls.push(url);
    }
    setUrls((prev) => [...prev, ...newUrls]);
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleVideoUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (file.size > 100 * 1024 * 1024) {
      toast({ title: "File Too Large", description: "Video must be under 100MB.", variant: "destructive" });
      if (videoInputRef.current) videoInputRef.current.value = "";
      return;
    }
    if (!file.type.startsWith("video/")) {
      toast({ title: "Invalid File", description: "Please select a video file.", variant: "destructive" });
      if (videoInputRef.current) videoInputRef.current.value = "";
      return;
    }
    setVideoUploading(true);
    const url = await uploadSingleFile(file);
    if (url) {
      const name = file.name.toLowerCase();
      const isMP4 = file.type === "video/mp4" || name.endsWith(".mp4");
      if (!isMP4) {
        try {
          const res = await apiRequest("POST", "/api/uploads/convert-video", { objectPath: url });
          const data = await res.json();
          setVideoUrl(data.objectPath);
        } catch {
          setVideoUrl(url);
        }
      } else {
        setVideoUrl(url);
      }
      toast({ title: "Video Uploaded", description: "New video uploaded successfully." });
    } else {
      toast({ title: "Upload Failed", description: "Failed to upload video.", variant: "destructive" });
    }
    setVideoUploading(false);
    if (videoInputRef.current) videoInputRef.current.value = "";
  }

  const mutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/submissions", data);
      return await res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: "Resubmission Sent", description: `SO# ${data.submission.serviceOrder} resubmitted successfully.` });
      queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string).startsWith("/api/submissions") });
      setLocation(`/tech/submissions/${data.submission.id}`);
    },
    onError: (error: Error) => {
      toast({ title: "Resubmission Failed", description: error.message, variant: "destructive" });
    },
  });

  function onSubmit(formData: ResubmitFormData) {
    const payload: any = { ...formData };
    const phoneOverride = localStorage.getItem("vrs_phone_override");
    if (phoneOverride) payload.phoneOverride = phoneOverride;
    const photosObj: any = {};
    if (estimatePhotoUrls.length > 0) photosObj.estimate = estimatePhotoUrls;
    if (issuePhotoUrls.length > 0) photosObj.issue = issuePhotoUrls;
    if (Object.keys(photosObj).length > 0) payload.photos = JSON.stringify(photosObj);
    if (videoUrl) payload.videoUrl = videoUrl;
    if (formData.appealNotes && formData.appealNotes.trim()) {
      payload.appealNotes = formData.appealNotes.trim();
    }
    payload.resubmissionOf = originalId;
    mutation.mutate(payload);
  }

  if (isLoading) {
    return (
      <div className="min-h-screen pb-20">
        <div className="bg-primary text-primary-foreground p-4">
          <div className="max-w-lg mx-auto">
            <Skeleton className="h-6 w-48 bg-primary-foreground/20" />
          </div>
        </div>
        <div className="max-w-lg mx-auto px-4 py-4 space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    );
  }

  if (error || !data?.submission) {
    return (
      <div className="min-h-screen pb-20">
        <div className="bg-primary text-primary-foreground p-4">
          <div className="max-w-lg mx-auto flex items-center gap-2">
            <Button size="icon" variant="ghost" className="text-primary-foreground" data-testid="button-back" onClick={() => setLocation("/tech/history")}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-lg font-bold">Submission Not Found</h1>
          </div>
        </div>
        <div className="max-w-lg mx-auto px-4 py-8 text-center">
          <p className="text-muted-foreground">The original submission could not be found.</p>
          <Button className="mt-4" data-testid="button-go-home" onClick={() => setLocation("/tech")}>Go Home</Button>
        </div>
      </div>
    );
  }

  const originalSub = data.submission;
  const resubCount = historyQuery.data?.resubmissionCount ?? 0;
  const maxResubs = historyQuery.data?.maxResubmissions ?? 3;
  const isMaxReached = resubCount >= maxResubs;
  const isRejectedClosed = originalSub.ticketStatus === "rejected_closed";

  return (
    <div className="min-h-screen pb-20">
      <div className="bg-primary text-primary-foreground p-4">
        <div className="max-w-lg mx-auto flex items-center gap-2">
          <Button size="icon" variant="ghost" className="text-primary-foreground" data-testid="button-back-resubmit" onClick={() => setLocation("/tech/history")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-lg font-bold" data-testid="text-resubmit-title">Resubmit Request</h1>
            <p className="text-sm opacity-80">SO# {originalSub.serviceOrder}</p>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4 space-y-4">
        {isRejectedClosed && (
          <Card className="border-destructive bg-destructive/10">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-destructive mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-destructive" data-testid="text-rejected-closed">Service order permanently closed</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    This repair has been determined to not be covered under warranty. No further submissions can be made for this service order. You may offer the customer a cash call estimate for the repair.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
        {isMaxReached && !isRejectedClosed && (
          <Card className="border-destructive bg-destructive/10">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-destructive mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-destructive" data-testid="text-max-resubmissions">Maximum resubmissions reached</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    You have reached the maximum of {maxResubs} resubmissions for this service order. Please call VRS directly for assistance.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-destructive mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-destructive" data-testid="text-rejection-banner">This submission was rejected</p>
                {originalSub.stage1RejectionReason && (
                  <p className="text-sm text-muted-foreground mt-1" data-testid="text-rejection-reason">
                    Reason: {originalSub.stage1RejectionReason}
                  </p>
                )}
                {resubCount > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Resubmission {resubCount + 1} of {maxResubs}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {!isMaxReached && (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <Card>
                <CardContent className="p-4 space-y-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Service Order</p>
                  <div className="flex items-center gap-2">
                    <Lock className="w-4 h-4 text-muted-foreground" />
                    <Input
                      value={originalSub.serviceOrder}
                      disabled
                      className="font-mono bg-muted"
                      data-testid="input-service-order-locked"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">Service order cannot be changed on resubmission</p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4 space-y-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Appeal Notes</p>
                  <FormField
                    control={form.control}
                    name="appealNotes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Additional Information</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Explain what was corrected or provide additional context..."
                            rows={3}
                            className="resize-none"
                            {...field}
                            data-testid="input-appeal-notes"
                          />
                        </FormControl>
                        <div className="flex justify-between">
                          <FormMessage />
                          <span className="text-xs text-muted-foreground">{field.value?.length || 0}/2000</span>
                        </div>
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4 space-y-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Technician Info</p>
                  <div>
                    <label className="text-sm font-medium">RAC ID</label>
                    <Input value={user?.racId || ""} disabled className="mt-1" data-testid="input-rac-id-resubmit" />
                  </div>
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone Number *</FormLabel>
                        <FormControl>
                          <Input placeholder="(555) 555-0147" {...field} data-testid="input-phone-resubmit" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4 space-y-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Appliance Details</p>

                  <FormField
                    control={form.control}
                    name="applianceType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Appliance Type *</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-appliance-type-resubmit">
                              <SelectValue placeholder="Select appliance type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {APPLIANCE_TYPES.map((type) => (
                              <SelectItem key={type.value} value={type.value}>
                                {type.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="requestType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Request Type</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-request-type-resubmit">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="authorization">Authorization</SelectItem>
                            <SelectItem value="infestation_non_accessible">Infestation / Non-Accessible</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4 space-y-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Issue Description</p>
                  <FormField
                    control={form.control}
                    name="issueDescription"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description *</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Describe the issue in detail..."
                            rows={5}
                            className="resize-none"
                            {...field}
                            data-testid="input-description-resubmit"
                          />
                        </FormControl>
                        <div className="flex justify-between">
                          <FormMessage />
                          <span className="text-xs text-muted-foreground">{field.value?.length || 0}/2000</span>
                        </div>
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4 space-y-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Issue Photos</p>
                  <div className="grid grid-cols-4 gap-2">
                    {issuePhotoUrls.map((url, i) => (
                      <div key={i} className="relative aspect-square bg-muted rounded-md overflow-hidden">
                        <img src={url} alt={`Issue ${i + 1}`} className="w-full h-full object-cover" data-testid={`img-issue-resubmit-${i}`} />
                        <button
                          type="button"
                          className="absolute top-1 right-1 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center"
                          onClick={() => setIssuePhotoUrls((prev) => prev.filter((_, idx) => idx !== i))}
                          data-testid={`button-remove-issue-photo-${i}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    {issuePhotoUrls.length < 15 && (
                      <button
                        type="button"
                        className="aspect-square border-2 border-dashed rounded-md flex flex-col items-center justify-center text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                        onClick={() => issuePhotoInputRef.current?.click()}
                        disabled={issuePhotoUploading}
                        data-testid="button-add-issue-photo-resubmit"
                      >
                        <Camera className="w-5 h-5" />
                        <span className="text-xs mt-1">{issuePhotoUploading ? "..." : "Add"}</span>
                      </button>
                    )}
                  </div>
                  <input
                    ref={issuePhotoInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => handlePhotosSelect(e.target.files, issuePhotoUrls, setIssuePhotoUrls, setIssuePhotoUploading, 15, issuePhotoInputRef)}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4 space-y-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Model, Serial & Estimate Screenshots</p>
                  <div className="grid grid-cols-4 gap-2">
                    {estimatePhotoUrls.map((url, i) => (
                      <div key={i} className="relative aspect-square bg-muted rounded-md overflow-hidden">
                        <img src={url} alt={`Estimate ${i + 1}`} className="w-full h-full object-cover" data-testid={`img-estimate-resubmit-${i}`} />
                        <button
                          type="button"
                          className="absolute top-1 right-1 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center"
                          onClick={() => setEstimatePhotoUrls((prev) => prev.filter((_, idx) => idx !== i))}
                          data-testid={`button-remove-estimate-photo-${i}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    {estimatePhotoUrls.length < 5 && (
                      <button
                        type="button"
                        className="aspect-square border-2 border-dashed rounded-md flex flex-col items-center justify-center text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                        onClick={() => estimatePhotoInputRef.current?.click()}
                        disabled={estimatePhotoUploading}
                        data-testid="button-add-estimate-photo-resubmit"
                      >
                        <Camera className="w-5 h-5" />
                        <span className="text-xs mt-1">{estimatePhotoUploading ? "..." : "Add"}</span>
                      </button>
                    )}
                  </div>
                  <input
                    ref={estimatePhotoInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => handlePhotosSelect(e.target.files, estimatePhotoUrls, setEstimatePhotoUrls, setEstimatePhotoUploading, 5, estimatePhotoInputRef)}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4 space-y-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Video className="w-3.5 h-3.5" />
                    Video
                  </p>
                  {videoUrl && (
                    <div className="relative rounded-md overflow-hidden bg-muted">
                      <video
                        src={videoUrl}
                        controls
                        className="w-full max-h-[200px]"
                        data-testid="video-player-resubmit"
                      />
                      <button
                        type="button"
                        className="absolute top-2 right-2 w-6 h-6 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center"
                        onClick={() => setVideoUrl(null)}
                        data-testid="button-remove-video"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => videoInputRef.current?.click()}
                    disabled={videoUploading}
                    data-testid="button-upload-video-resubmit"
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    {videoUploading ? "Uploading..." : videoUrl ? "Replace Video" : "Upload Video"}
                  </Button>
                  <input
                    ref={videoInputRef}
                    type="file"
                    accept="video/*"
                    className="hidden"
                    onChange={(e) => handleVideoUpload(e.target.files)}
                  />
                </CardContent>
              </Card>

              <Button
                type="submit"
                className="w-full"
                disabled={mutation.isPending || isRejectedClosed}
                data-testid="button-resubmit"
              >
                <Send className="w-4 h-4 mr-2" />
                {mutation.isPending ? "Resubmitting..." : isRejectedClosed ? "Service Order Closed" : "Resubmit to VRS"}
              </Button>
            </form>
          </Form>
        )}
      </div>
    </div>
  );
}
