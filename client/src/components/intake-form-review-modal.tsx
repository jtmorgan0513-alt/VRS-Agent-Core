// =============================================================================
// IntakeFormReviewModal — opens the pre-filled Smartsheet form in an iframe,
// lets the agent verify the answers, and records confirmation back to VRS.
// =============================================================================
// Server endpoints used:
//   POST /api/submissions/:id/intake-form/preview  -> { url, params, branch }
//   POST /api/submissions/:id/intake-form/confirm  -> { intakeForm }
// =============================================================================

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Loader2, ExternalLink, AlertTriangle, CheckCircle2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export interface IntakeFormReviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  submissionId: number | null;
  /** Agent's working payload (Smartsheet column label -> value). */
  payload: Record<string, string>;
  /** Called once the agent has confirmed Smartsheet success and the audit row
   *  is created. Used by parent to release the claim gate / clear state. */
  onConfirmed: () => void;
}

interface PreviewResponse {
  url: string;
  params: Record<string, string>;
  branch: string;
  warnings: string[];
}

export function IntakeFormReviewModal({
  open,
  onOpenChange,
  submissionId,
  payload,
  onConfirmed,
}: IntakeFormReviewModalProps) {
  const { toast } = useToast();
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [smartsheetSuccessConfirmed, setSmartsheetSuccessConfirmed] = useState(false);

  useEffect(() => {
    if (!open || !submissionId) {
      setPreview(null);
      setError(null);
      setSmartsheetSuccessConfirmed(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await apiRequest(
          "POST",
          `/api/submissions/${submissionId}/intake-form/preview`,
          { payload }
        );
        const data = (await res.json()) as PreviewResponse;
        if (!cancelled) setPreview(data);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to build pre-fill URL";
        if (!cancelled) setError(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, submissionId, payload]);

  const onConfirm = async () => {
    if (!submissionId || !preview) return;
    setConfirming(true);
    try {
      await apiRequest(
        "POST",
        `/api/submissions/${submissionId}/intake-form/confirm`,
        {
          payload,
          smartsheetUrlSubmitted: preview.url,
        }
      );
      toast({
        title: "Intake recorded",
        description: "Smartsheet submission logged. You can claim the next ticket.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/agent/intake-status"] });
      queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string).startsWith("/api/submissions") });
      onOpenChange(false);
      onConfirmed();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to record intake";
      toast({ title: "Could not record intake", description: msg, variant: "destructive" });
    } finally {
      setConfirming(false);
    }
  };

  const iframeKey = useMemo(() => `${submissionId}-${preview?.url ?? ""}`, [submissionId, preview?.url]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[95vw] h-[90vh] flex flex-col gap-0 p-0" data-testid="dialog-intake-review">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle data-testid="text-intake-modal-title">Review &amp; Submit Intake Form</DialogTitle>
          <DialogDescription>
            The Smartsheet form below is pre-filled with the answers you entered. Verify the values, click <strong>Submit</strong> inside the form, then click <strong>I submitted Smartsheet</strong> to record the intake in VRS.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 flex flex-col">
          {loading && (
            <div className="flex-1 flex items-center justify-center text-muted-foreground" data-testid="loading-intake-preview">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              Building pre-filled form…
            </div>
          )}
          {error && !loading && (
            <div className="flex-1 flex items-center justify-center text-destructive p-6" data-testid="error-intake-preview">
              <AlertTriangle className="w-5 h-5 mr-2" />
              {error}
            </div>
          )}
          {preview && !loading && (
            <>
              {preview.warnings.length > 0 && (
                <div className="px-6 py-2 border-b bg-amber-50 dark:bg-amber-950/30 text-xs text-amber-800 dark:text-amber-200" data-testid="warnings-intake-preview">
                  {preview.warnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-1.5">
                      <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                      <span>{w}</span>
                    </div>
                  ))}
                </div>
              )}
              <iframe
                key={iframeKey}
                src={preview.url}
                title="Smartsheet Intake Form"
                className="flex-1 w-full border-0"
                sandbox="allow-forms allow-scripts allow-same-origin allow-popups"
                data-testid="iframe-intake-smartsheet"
              />
            </>
          )}
        </div>

        <DialogFooter className="px-6 py-3 border-t flex-col items-stretch gap-3 sm:flex-col">
          {/* Required attestation — guards against agents clicking "I
              submitted Smartsheet" without actually clicking Smartsheet's
              own Submit button inside the iframe. The audit row in
              intake_forms is only as trustworthy as this checkbox. */}
          <div className="flex items-start gap-2 px-1" data-testid="container-intake-confirm-attestation">
            <Checkbox
              id="intake-smartsheet-confirmed"
              checked={smartsheetSuccessConfirmed}
              onCheckedChange={(v) => setSmartsheetSuccessConfirmed(v === true)}
              disabled={confirming || !preview}
              data-testid="checkbox-smartsheet-success-confirmed"
            />
            <Label
              htmlFor="intake-smartsheet-confirmed"
              className="text-xs leading-snug cursor-pointer"
              data-testid="label-smartsheet-success-confirmed"
            >
              I confirmed the Smartsheet success page appeared after clicking
              <strong> Submit </strong>
              inside the form above.
            </Label>
          </div>
          <div className="flex flex-row items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Button
                variant="ghost"
                size="sm"
                asChild
                data-testid="link-intake-open-new-tab"
              >
                <a href={preview?.url || "#"} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-3 h-3 mr-1" />
                  Open in new tab
                </a>
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={confirming}
                data-testid="button-intake-cancel"
              >
                Cancel
              </Button>
              <Button
                onClick={onConfirm}
                disabled={confirming || !preview || !smartsheetSuccessConfirmed}
                data-testid="button-intake-confirm"
              >
                {confirming ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                )}
                I submitted Smartsheet
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
