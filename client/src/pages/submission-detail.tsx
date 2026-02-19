import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Copy,
  ArrowLeft,
  ExternalLink,
  ImageIcon,
  Video,
  Mic,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Submission } from "@shared/schema";

export default function SubmissionDetailPage() {
  const [, params] = useRoute("/tech/submissions/:id");
  const id = params?.id;
  const { toast } = useToast();

  const { data, isLoading, error } = useQuery<{ submission: Submission }>({
    queryKey: ["/api/submissions", id],
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen pb-20">
        <div className="bg-primary text-primary-foreground p-4">
          <div className="max-w-lg mx-auto">
            <Skeleton className="h-6 w-40 bg-primary-foreground/20" />
          </div>
        </div>
        <div className="max-w-lg mx-auto px-4 py-4 space-y-4">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-32 w-full" />
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
              <Button size="icon" variant="ghost" className="text-primary-foreground no-default-hover-elevate no-default-active-elevate">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <h1 className="text-lg font-bold">Submission Not Found</h1>
          </div>
        </div>
        <div className="max-w-lg mx-auto px-4 py-8 text-center">
          <p className="text-muted-foreground">This submission could not be found.</p>
          <Link href="/tech">
            <Button className="mt-4" data-testid="button-go-home">Go Home</Button>
          </Link>
        </div>
      </div>
    );
  }

  const sub = data.submission;
  const stage1Status = sub.stage1Status;
  const hasAuthCode = !!sub.authCode;

  function getHeaderConfig() {
    if (stage1Status === "rejected") {
      return {
        bgClass: "bg-destructive text-destructive-foreground",
        icon: <AlertTriangle className="w-10 h-10 mx-auto mb-2" />,
        title: "Resubmission Needed",
        subtitle: `Service Order #${sub.serviceOrder}`,
      };
    }
    if (stage1Status === "approved" && hasAuthCode) {
      return {
        bgClass: "bg-green-700 text-white",
        icon: <CheckCircle className="w-10 h-10 mx-auto mb-2" />,
        title: "Authorization Ready",
        subtitle: `Service Order #${sub.serviceOrder}`,
      };
    }
    if (stage1Status === "approved") {
      return {
        bgClass: "bg-green-700 text-white",
        icon: <CheckCircle className="w-10 h-10 mx-auto mb-2" />,
        title: "Submission Approved",
        subtitle: `Service Order #${sub.serviceOrder}`,
      };
    }
    return {
      bgClass: "bg-primary text-primary-foreground",
      icon: <Clock className="w-10 h-10 mx-auto mb-2 opacity-80" />,
      title: "Under Review",
      subtitle: `Service Order #${sub.serviceOrder}`,
    };
  }

  const headerConfig = getHeaderConfig();

  function copyAuthCode() {
    if (sub.authCode) {
      navigator.clipboard.writeText(sub.authCode);
      toast({ title: "Copied", description: "Authorization code copied to clipboard." });
    }
  }

  return (
    <div className="min-h-screen pb-20">
      <div className={`${headerConfig.bgClass} p-4 pb-8`}>
        <div className="max-w-lg mx-auto">
          <div className="flex items-center gap-2 mb-4">
            <Link href="/tech/history">
              <Button size="icon" variant="ghost" className="text-inherit no-default-hover-elevate no-default-active-elevate">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <p className="text-sm opacity-80">{headerConfig.subtitle}</p>
          </div>
          <div className="text-center py-4">
            {headerConfig.icon}
            <h1 className="text-xl font-bold" data-testid="text-status-title">{headerConfig.title}</h1>
            {stage1Status === "pending" && (
              <p className="text-sm opacity-80 mt-1">
                Your submission is being reviewed by a VRS agent. You'll receive an SMS notification shortly.
              </p>
            )}
            {stage1Status === "approved" && !hasAuthCode && (
              <p className="text-sm opacity-80 mt-1">
                You're Clear to Go! Your authorization code will arrive via SMS.
              </p>
            )}
            {stage1Status === "rejected" && (
              <p className="text-sm opacity-80 mt-1">
                VRS needs additional information before they can proceed with authorization.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 -mt-4 space-y-4">
        {hasAuthCode && (
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Authorization Code</p>
              <div className="bg-primary text-primary-foreground rounded-md py-4 px-6 mb-3">
                <p className="text-2xl font-mono font-bold tracking-wider" data-testid="text-auth-code">
                  {sub.authCode}
                </p>
              </div>
              <Button onClick={copyAuthCode} className="w-full" data-testid="button-copy-code">
                <Copy className="w-4 h-4 mr-2" />
                Copy Code to Clipboard
              </Button>
            </CardContent>
          </Card>
        )}

        {stage1Status === "rejected" && sub.stage1RejectionReason && (
          <Card className="border-destructive">
            <CardContent className="p-4">
              <p className="text-sm font-semibold text-destructive mb-1">What's Missing:</p>
              <p className="text-sm" data-testid="text-rejection-reason">{sub.stage1RejectionReason}</p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="p-4 space-y-3">
            <DetailRow label="Service Order" value={`#${sub.serviceOrder}`} testId="text-detail-so" />
            <DetailRow label="Appliance" value={sub.applianceType.charAt(0).toUpperCase() + sub.applianceType.slice(1)} testId="text-detail-appliance" />
            <DetailRow label="Request Type" value={sub.requestType === "authorization" ? "Authorization" : "Infestation / Non-Accessible"} testId="text-detail-request-type" />
            <DetailRow label="Status" value={
              <StatusBadge
                stage1={sub.stage1Status}
                stage2={sub.stage2Status}
                hasAuthCode={hasAuthCode}
              />
            } testId="text-detail-status" />
            {sub.createdAt && (
              <DetailRow
                label="Submitted"
                value={new Date(sub.createdAt).toLocaleString()}
                testId="text-detail-submitted"
              />
            )}
            {sub.stage1ReviewedAt && (
              <DetailRow
                label={stage1Status === "approved" ? "Approved At" : "Reviewed At"}
                value={new Date(sub.stage1ReviewedAt).toLocaleString()}
                testId="text-detail-reviewed"
              />
            )}
          </CardContent>
        </Card>

        {(() => {
          let parsed: any = null;
          try { parsed = sub.photos ? JSON.parse(sub.photos) : null; } catch { parsed = null; }
          if (!parsed) return null;
          
          const isNewFormat = parsed && typeof parsed === "object" && !Array.isArray(parsed);
          const estimatePhotos: string[] = isNewFormat ? (parsed.estimate || []) : [];
          const issuePhotos: string[] = isNewFormat ? (parsed.issue || []) : [];
          const legacyPhotos: string[] = Array.isArray(parsed) ? parsed : [];
          const hasAny = estimatePhotos.length > 0 || issuePhotos.length > 0 || legacyPhotos.length > 0;
          
          return hasAny ? (
            <Card>
              <CardContent className="p-4 space-y-4">
                {estimatePhotos.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <ImageIcon className="w-3.5 h-3.5" />
                      TechHub Estimate ({estimatePhotos.length})
                    </p>
                    <div className="grid grid-cols-3 gap-2" data-testid="media-estimate-photos-detail">
                      {estimatePhotos.map((url: string, i: number) => (
                        <div key={i} className="aspect-square bg-muted rounded-md overflow-hidden">
                          <img src={url} alt={`Estimate ${i + 1}`} className="w-full h-full object-cover" data-testid={`img-estimate-detail-${i}`} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {issuePhotos.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <ImageIcon className="w-3.5 h-3.5" />
                      Model/Serial & Issue Photos ({issuePhotos.length})
                    </p>
                    <div className="grid grid-cols-3 gap-2" data-testid="media-issue-photos-detail">
                      {issuePhotos.map((url: string, i: number) => (
                        <div key={i} className="aspect-square bg-muted rounded-md overflow-hidden">
                          <img src={url} alt={`Issue ${i + 1}`} className="w-full h-full object-cover" data-testid={`img-issue-detail-${i}`} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {legacyPhotos.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <ImageIcon className="w-3.5 h-3.5" />
                      Photos ({legacyPhotos.length})
                    </p>
                    <div className="grid grid-cols-3 gap-2" data-testid="media-photos-detail">
                      {legacyPhotos.map((url: string, i: number) => (
                        <div key={i} className="aspect-square bg-muted rounded-md overflow-hidden">
                          <img src={url} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" data-testid={`img-photo-detail-${i}`} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null;
        })()}

        {sub.videoUrl && (
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Video className="w-3.5 h-3.5" />
                Video Attachment
              </p>
              <div className="rounded-md overflow-hidden bg-muted" data-testid="media-video-detail">
                <video
                  src={sub.videoUrl}
                  controls
                  className="w-full max-h-[250px]"
                  data-testid="video-player-detail"
                />
              </div>
            </CardContent>
          </Card>
        )}

        {sub.voiceNoteUrl && (
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Mic className="w-3.5 h-3.5" />
                Voice Note
              </p>
              <audio src={sub.voiceNoteUrl} controls className="w-full" data-testid="audio-player-detail" />
            </CardContent>
          </Card>
        )}

        {stage1Status === "rejected" && (
          <div className="space-y-2">
            <Link href="/tech/submit">
              <Button className="w-full" data-testid="button-resubmit">Resubmit with Updates</Button>
            </Link>
          </div>
        )}

        <Link href="/tech">
          <Button variant="outline" className="w-full" data-testid="button-view-next">
            {stage1Status === "approved" ? "View Next Job" : "Back to Home"}
          </Button>
        </Link>
      </div>
    </div>
  );
}

function DetailRow({ label, value, testId }: { label: string; value: React.ReactNode; testId?: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium" data-testid={testId}>{value}</span>
    </div>
  );
}

function StatusBadge({ stage1, stage2, hasAuthCode }: { stage1: string; stage2: string; hasAuthCode: boolean }) {
  if (hasAuthCode) return <Badge className="bg-green-600 text-white border-green-600">Auth Code Issued</Badge>;
  if (stage1 === "approved" && stage2 === "pending") return <Badge className="bg-yellow-600 text-white border-yellow-600">Awaiting Auth Code</Badge>;
  if (stage1 === "approved") return <Badge className="bg-green-600 text-white border-green-600">Approved</Badge>;
  if (stage1 === "rejected") return <Badge variant="destructive">Rejected</Badge>;
  return <Badge variant="secondary">Stage 1 Review</Badge>;
}
