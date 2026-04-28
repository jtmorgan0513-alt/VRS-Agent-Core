// =============================================================================
// IntakeFormTab — renders the pre-filled Smartsheet intake form inside the
// right-side panel of the agent ticket resolution page (third tab, alongside
// Service Order History and Calculator).
// =============================================================================
// History: this component supersedes the prior IntakeFormReviewModal. The modal
// popup model was retired 2026-04-27 (Tyler) — the form now lives as a tab so
// it sits next to SHSAI / Calculator instead of stealing focus. The Option B
// onLoad probe / auto-close work that lived in the modal is also cancelled —
// see COMMITS.md and docs/superpowers/plans/2026-04-25-calculator-and-intake-form.md.
//
// Server endpoints used (UNCHANGED from the modal era):
//   POST /api/submissions/:id/intake-form/preview  -> { url, params, branch, warnings, derivedDefaults? }
//   POST /api/submissions/:id/intake-form/confirm  -> { intakeForm }
//
// Source of truth for the green "intake recorded" banner:
//   GET /api/submissions/:id/intake-form-status (queried by the parent and
//   passed in via the `intakeStatus` prop). The banner reads
//   intakeStatus.intakeForm.createdAt so it persists across re-visits to the
//   same ticket — per Tyler's Q3 pick (PERSIST FROM SERVER).
// =============================================================================

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Loader2,
  ExternalLink,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export interface IntakeFormTabIntakeStatus {
  required: boolean;
  recorded: boolean;
  reason?: string;
  intakeForm?: { id: number; createdAt: string; smartsheetUrlSubmitted?: string };
}

export interface IntakeFormTabProps {
  submissionId: number | null;
  /** Service order string for the success banner copy. */
  serviceOrder: string | null;
  /** Agent's working payload (Smartsheet column label -> value). */
  payload: Record<string, string>;
  /** Server-side intake status — drives empty / required / recorded modes. */
  intakeStatus: IntakeFormTabIntakeStatus | undefined;
  /** Called once the agent has confirmed Smartsheet success and the audit
   *  row is created. Used by parent to clear local working state and
   *  invalidate the per-submission status query. */
  onConfirmed: () => void;
  /** Emits server-side derived defaults so the parent can seed the Stage 3
   *  fallback fieldset state (preserves the same plumbing the modal had). */
  onPreviewLoaded?: (derivedDefaults: Record<string, string>) => void;
}

interface PreviewResponse {
  url: string;
  params: Record<string, string>;
  branch: string;
  warnings: string[];
  derivedDefaults?: Record<string, string>;
}

function formatRecordedAt(iso: string): string {
  // HH:MM (locale-aware) — matches Tyler's spec for the success banner.
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

export function IntakeFormTab({
  submissionId,
  serviceOrder,
  payload,
  intakeStatus,
  onConfirmed,
  onPreviewLoaded,
}: IntakeFormTabProps) {
  const { toast } = useToast();
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [smartsheetSuccessConfirmed, setSmartsheetSuccessConfirmed] = useState(false);

  const required = !!intakeStatus?.required;
  const recorded = !!intakeStatus?.recorded;
  const recordedAt = intakeStatus?.intakeForm?.createdAt ?? null;

  // Reset attestation when switching submissions so a checked box doesn't
  // bleed across tickets.
  useEffect(() => {
    setSmartsheetSuccessConfirmed(false);
    setPreview(null);
    setError(null);
  }, [submissionId]);

  // Tyler 2026-04-28 (requirement change, OVERRIDES the prior 2026-04-27
  // Q1 = CONDITIONAL + PRE-AUTH GHOST design): the iframe must load
  // immediately when the agent opens a ticket — not after Authorize, not
  // after auth code is issued. Pre-auth fields (auth code, etc.) are
  // simply absent from the prefill payload; everything else (proc id,
  // tech ids, phone, etc.) is filled in. The earlier
  // `if (!required && !recorded) return;` early-exit gate has been
  // removed so the preview POST always fires for any non-NLA ticket.
  useEffect(() => {
    if (!submissionId) return;
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
          // Mirror the modal's anti-feedback-loop guard: only fire the
          // callback when there are defaults to merge. Parents that wire
          // derivedDefaults back into `payload` would otherwise infinite-
          // loop through this useEffect.
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
    // `onPreviewLoaded` intentionally excluded — parent wraps it in a
    // setState updater, so a stable identity isn't guaranteed and including
    // it would cause spurious refetches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submissionId, payload, required, recorded]);

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
      // Per-submission status query drives the green banner — invalidating
      // it here flips `recorded` to true on the next tick.
      queryClient.invalidateQueries({
        predicate: (q) => (q.queryKey[0] as string).startsWith("/api/submissions"),
      });
      onConfirmed();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to record intake";
      toast({ title: "Could not record intake", description: msg, variant: "destructive" });
    } finally {
      setConfirming(false);
    }
  };

  const iframeKey = useMemo(
    () => `${submissionId}-${preview?.url ?? ""}`,
    [submissionId, preview?.url]
  );

  // -------------------------------------------------------------------------
  // Tyler 2026-04-28 (requirement change, OVERRIDES the prior pre-auth
  // ghost design): the empty-state placeholder has been REMOVED. The
  // iframe must always render for any ticket that reaches this tab, even
  // pre-Authorize. Pre-auth fields (auth code, etc.) are simply absent
  // from the prefill payload — the form still loads and is usable for
  // everything else. The recorded-state banner above is unchanged.
  // -------------------------------------------------------------------------
  return (
    <div className="flex-1 flex flex-col min-h-0" data-testid="panel-intake-tab">
      {/* Tyler 2026-04-27 (Q3 = PERSIST FROM SERVER): green success banner
          reads intakeStatus.intakeForm.createdAt, so it shows on every re-
          visit to a ticket whose intake_forms row exists. No client-side
          dismissal — server is the source of truth. */}
      {recorded && recordedAt && (
        <div
          className="px-4 py-2 border-b bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200 flex items-center gap-2 text-sm"
          data-testid="banner-intake-recorded"
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span data-testid="text-intake-recorded">
            Intake recorded for SO {serviceOrder ?? "—"} at {formatRecordedAt(recordedAt)}
          </span>
        </div>
      )}

      {preview && preview.warnings.length > 0 && (
        <div
          className="px-4 py-2 border-b bg-amber-50 dark:bg-amber-950/30 text-xs text-amber-800 dark:text-amber-200"
          data-testid="warnings-intake-preview"
        >
          {preview.warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-1.5">
              <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex-1 min-h-0 flex flex-col">
        {loading && !preview && (
          <div
            className="flex-1 flex items-center justify-center text-muted-foreground"
            data-testid="loading-intake-preview"
          >
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Building pre-filled form…
          </div>
        )}
        {error && !loading && (
          <div
            className="flex-1 flex items-center justify-center text-destructive p-6 text-sm text-center"
            data-testid="error-intake-preview"
          >
            <AlertTriangle className="w-5 h-5 mr-2 shrink-0" />
            {error}
          </div>
        )}
        {preview && (
          <iframe
            key={iframeKey}
            src={preview.url}
            title="Smartsheet Intake Form"
            className="flex-1 w-full border-0"
            sandbox="allow-forms allow-scripts allow-same-origin allow-popups"
            data-testid="iframe-intake-smartsheet"
          />
        )}
      </div>

      {/* Footer (attestation + submit) only shows pre-confirmation. Once the
          server reports `recorded`, the banner above is the agent's signal
          and the form below collapses to keep the iframe maxed out. */}
      {!recorded && (
        <div className="border-t px-3 py-3 flex flex-col gap-2">
          <div
            className="flex items-start gap-2"
            data-testid="container-intake-confirm-attestation"
          >
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
          <div className="flex items-center justify-between gap-2">
            <Button
              variant="ghost"
              size="sm"
              asChild
              data-testid="link-intake-open-new-tab"
            >
              <a
                href={preview?.url || "#"}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="w-3 h-3 mr-1" />
                Open in new tab
              </a>
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
      )}
    </div>
  );
}
