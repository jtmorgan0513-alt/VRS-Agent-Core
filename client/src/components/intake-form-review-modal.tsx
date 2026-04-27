// =============================================================================
// IntakeFormReviewModal — opens the pre-filled Smartsheet form in an iframe,
// lets the agent verify the answers, and records confirmation back to VRS.
// =============================================================================
// Server endpoints used:
//   POST /api/submissions/:id/intake-form/preview  -> { url, params, branch }
//   POST /api/submissions/:id/intake-form/confirm  -> { intakeForm }
// =============================================================================

import { useEffect, useMemo, useRef, useState } from "react";
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
   *  is created. Used by parent to clear local working state. */
  onConfirmed: () => void;
  /** Tyler 2026-04-26 (D4 max-derivation): emits the server-side derived
   *  defaults so the parent can seed the Stage 3 fallback fieldset state.
   *  This way an agent who closes the auto-opened modal sees the same
   *  pre-fill when re-opening from the Stage 3 card. Strictly additive —
   *  modal continues to work without this callback. */
  onPreviewLoaded?: (derivedDefaults: Record<string, string>) => void;
}

interface PreviewResponse {
  url: string;
  params: Record<string, string>;
  branch: string;
  warnings: string[];
  derivedDefaults?: Record<string, string>;
}

export function IntakeFormReviewModal({
  open,
  onOpenChange,
  submissionId,
  payload,
  onConfirmed,
  onPreviewLoaded,
}: IntakeFormReviewModalProps) {
  const { toast } = useToast();
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [smartsheetSuccessConfirmed, setSmartsheetSuccessConfirmed] = useState(false);

  // Tyler 2026-04-27 (auto-close probe — Option B / interim):
  // Counts iframe load events to detect Smartsheet's post-submit thank-you
  // navigation (load #1 = initial form render, load #2+ = nav after Submit).
  // PROBE BUILD ONLY — instrumentation logs `[INTAKE-PROBE]` to console; the
  // existing manual-confirm footer remains the source of truth for now.
  // After Tyler verifies the 1->2 pattern walking SO 99999000005, we cut
  // over (Step 2): wire onLoad>=2 to fire handleSmartsheetSuccess() and
  // remove the footer. Designed so the trigger source is one place to flip
  // when Todd Pennington enables the Smartsheet post-submit redirect URL
  // (Option D) — at that point the onLoad detector is replaced by a
  // window.message listener / poll, but handleSmartsheetSuccess stays put.
  const loadCountRef = useRef(0);

  useEffect(() => {
    if (!open || !submissionId) {
      setPreview(null);
      setError(null);
      setSmartsheetSuccessConfirmed(false);
      loadCountRef.current = 0;
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
        if (!cancelled) {
          setPreview(data);
          // Skip the callback when there are no defaults to merge — guards
          // against any chance of a feedback loop with parents that wire
          // derivedDefaults back into `payload`.
          if (
            onPreviewLoaded &&
            data.derivedDefaults &&
            Object.keys(data.derivedDefaults).length > 0
          ) {
            onPreviewLoaded(data.derivedDefaults);
          }
        }
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
      // Per-submission status is what now drives Stage 3 visibility — the
      // per-agent /api/agent/intake-status rollup was retired with the gate.
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
                onLoad={() => {
                  loadCountRef.current += 1;
                  // PROBE BUILD ONLY — see comment on loadCountRef above.
                  // Walk SO 99999000005: load #1 should fire on initial form
                  // render, load #2 should fire after clicking Submit inside
                  // the Smartsheet form (the post-submit thank-you nav).
                  // If the pattern is anything other than 1 -> 2, stop and
                  // report rather than ship the auto-close cutover.
                  // eslint-disable-next-line no-console
                  console.log("[INTAKE-PROBE] iframe load", {
                    loadCount: loadCountRef.current,
                    timestamp: new Date().toISOString(),
                    submissionId,
                    branch: preview?.branch,
                    iframeSrc: preview?.url,
                    note:
                      loadCountRef.current === 1
                        ? "initial form render — would be ignored by auto-close"
                        : "would auto-fire confirm in Step 2 build (manual footer still active in this probe build)",
                  });
                }}
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
