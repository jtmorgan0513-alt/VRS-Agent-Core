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
import { Camera, Send, X, AlertTriangle, ArrowLeft, Lock } from "lucide-react";
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
  const [initialized, setInitialized] = useState(false);
  const issuePhotoInputRef = useRef<HTMLInputElement>(null);
  const estimatePhotoInputRef = useRef<HTMLInputElement>(null);

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
    },
  });

  const { data, isLoading, error } = useQuery<{ submission: Submission }>({
    queryKey: ["/api/submissions", originalId],
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
    });
    try {
      const parsed = sub.photos ? JSON.parse(sub.photos) : null;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        if (parsed.issue) setIssuePhotoUrls(parsed.issue);
        if (parsed.estimate) setEstimatePhotoUrls(parsed.estimate);
      } else if (Array.isArray(parsed)) {
        setIssuePhotoUrls(parsed);
      }
    } catch {}
    setInitialized(true);
  }

  async function uploadSinglePhoto(file: File): Promise<string | null> {
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
      const url = await uploadSinglePhoto(file);
      if (url) newUrls.push(url);
    }
    setUrls((prev) => [...prev, ...newUrls]);
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
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
            <Link href="/tech/history">
              <Button size="icon" variant="ghost" className="text-primary-foreground" data-testid="button-back">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <h1 className="text-lg font-bold">Submission Not Found</h1>
          </div>
        </div>
        <div className="max-w-lg mx-auto px-4 py-8 text-center">
          <p className="text-muted-foreground">The original submission could not be found.</p>
          <Link href="/tech">
            <Button className="mt-4" data-testid="button-go-home">Go Home</Button>
          </Link>
        </div>
      </div>
    );
  }

  const originalSub = data.submission;

  return (
    <div className="min-h-screen pb-20">
      <div className="bg-primary text-primary-foreground p-4">
        <div className="max-w-lg mx-auto flex items-center gap-2">
          <Link href="/tech/history">
            <Button size="icon" variant="ghost" className="text-primary-foreground" data-testid="button-back-resubmit">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-lg font-bold" data-testid="text-resubmit-title">Resubmit Request</h1>
            <p className="text-sm opacity-80">SO# {originalSub.serviceOrder}</p>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4 space-y-4">
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
              </div>
            </div>
          </CardContent>
        </Card>

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
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Issue-Related Photos</p>
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
                  {issuePhotoUrls.length < 5 && (
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
                  onChange={(e) => handlePhotosSelect(e.target.files, issuePhotoUrls, setIssuePhotoUrls, setIssuePhotoUploading, 5, issuePhotoInputRef)}
                />
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 space-y-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Model, Serial & Estimate Photos</p>
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

            <Button
              type="submit"
              className="w-full"
              disabled={mutation.isPending}
              data-testid="button-resubmit"
            >
              <Send className="w-4 h-4 mr-2" />
              {mutation.isPending ? "Resubmitting..." : "Resubmit to VRS"}
            </Button>
          </form>
        </Form>
      </div>
    </div>
  );
}
