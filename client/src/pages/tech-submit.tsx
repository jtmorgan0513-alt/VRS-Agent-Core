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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Camera, Send, Lock, Video, X, Upload } from "lucide-react";

const APPLIANCE_TYPES = [
  { value: "refrigeration", label: "Refrigerator" },
  { value: "laundry", label: "Laundry" },
  { value: "cooking", label: "Cooking" },
  { value: "dishwasher", label: "Dishwasher" },
  { value: "microwave", label: "Microwave" },
  { value: "hvac", label: "HVAC" },
];

const WARRANTY_PROVIDERS = [
  { value: "sears_protect", label: "Sears Protect", available: true },
  { value: "b2b_asurion", label: "Asurion", available: false },
  { value: "b2b_allstate", label: "Allstate", available: false },
  { value: "b2b_cinch", label: "Cinch", available: false },
];

const submissionFormSchema = z.object({
  serviceOrder: z.string().min(1, "Service order number is required"),
  phone: z.string().min(7, "Valid phone number is required"),
  applianceType: z.enum(["cooking", "dishwasher", "microwave", "laundry", "refrigeration", "hvac"], {
    required_error: "Select an appliance type",
  }),
  requestType: z.enum(["authorization", "non_repairable_review"]),
  warrantyType: z.enum(["sears_protect", "b2b"]).default("sears_protect"),
  warrantyProvider: z.string().optional(),
  issueDescription: z.string().min(10, "Please provide at least 10 characters"),
  estimateAmount: z.string().optional(),
});

type SubmissionFormData = z.infer<typeof submissionFormSchema>;

export default function TechSubmitPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  function handleVideoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setVideoError(null);

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
      setVideoError("Could not read video file. Please try a different format.");
      if (videoInputRef.current) videoInputRef.current.value = "";
    };
    videoEl.src = URL.createObjectURL(file);
  }

  function uploadVideo(file: File) {
    const token = getToken();
    const formData = new FormData();
    formData.append("video", file);

    const xhr = new XMLHttpRequest();
    setIsUploading(true);
    setUploadProgress(0);

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        setUploadProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener("load", () => {
      setIsUploading(false);
      if (xhr.status >= 200 && xhr.status < 300) {
        const response = JSON.parse(xhr.responseText);
        setVideoUrl(response.videoUrl);
      } else {
        toast({ title: "Upload Failed", description: "Failed to upload video", variant: "destructive" });
      }
    });

    xhr.addEventListener("error", () => {
      setIsUploading(false);
      toast({ title: "Upload Failed", description: "Network error during upload", variant: "destructive" });
    });

    xhr.open("POST", "/api/upload/video");
    if (token) {
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    }
    xhr.send(formData);
  }

  function removeVideo() {
    setVideoUrl(null);
    setUploadProgress(0);
    setVideoError(null);
    if (videoInputRef.current) videoInputRef.current.value = "";
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
      estimateAmount: "",
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: SubmissionFormData) => {
      const payload: Record<string, unknown> = { ...data };
      if (videoUrl) payload.videoUrl = videoUrl;
      const res = await apiRequest("POST", "/api/submissions", payload);
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/submissions"] });
      toast({ title: "Submission Created", description: `Service Order #${data.submission.serviceOrder} submitted successfully.` });
      setLocation(`/submissions/${data.submission.id}`);
    },
    onError: (error: Error) => {
      toast({ title: "Submission Failed", description: error.message, variant: "destructive" });
    },
  });

  function onSubmit(data: SubmissionFormData) {
    mutation.mutate(data);
  }

  const watchedRequestType = form.watch("requestType");

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
                  <FormLabel>Request Type</FormLabel>
                  <FormControl>
                    <Tabs value={field.value} onValueChange={field.onChange}>
                      <TabsList className="w-full">
                        <TabsTrigger value="authorization" className="flex-1" data-testid="tab-authorization">
                          Authorization
                        </TabsTrigger>
                        <TabsTrigger value="non_repairable_review" className="flex-1" data-testid="tab-non-repairable">
                          Non-Repairable
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </FormControl>
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
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Service Order # *</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. 4521789" {...field} data-testid="input-service-order" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
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
                  <label className="text-sm font-medium">Warranty Provider *</label>
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
                          placeholder="Describe the issue and required repair..."
                          className="min-h-[100px]"
                          {...field}
                          data-testid="input-issue-description"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {watchedRequestType === "authorization" && (
                  <FormField
                    control={form.control}
                    name="estimateAmount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Estimate Amount ($)</FormLabel>
                        <FormControl>
                          <Input
                            type="text"
                            placeholder="0.00"
                            {...field}
                            data-testid="input-estimate-amount"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Required Photos</p>
                <div className="border-2 border-dashed rounded-md p-6 text-center">
                  <Camera className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Tap to add photos</p>
                  <p className="text-xs text-muted-foreground mt-1">Model/serial plate, error codes, damage</p>
                </div>
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
                {!videoUrl && !isUploading && (
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

            <Button
              type="submit"
              className="w-full"
              size="lg"
              disabled={mutation.isPending}
              data-testid="button-submit-form"
            >
              <Send className="w-4 h-4 mr-2" />
              {mutation.isPending ? "Submitting..." : "Submit for Review"}
            </Button>
          </form>
        </Form>
      </div>
    </div>
  );
}
