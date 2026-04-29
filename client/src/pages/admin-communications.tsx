import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArrowLeft, MessageSquare, Loader2, RotateCcw } from "lucide-react";

type TemplateVariable = {
  name: string;
  required: boolean;
  sample: string;
  description?: string;
};

type CommunicationTemplate = {
  id: number;
  channel: "sms" | "email" | "push";
  actionKey: string;
  subject: string | null;
  title: string | null;
  body: string;
  variables: TemplateVariable[];
  isDefault: boolean;
  isActive: boolean;
  currentVersion: number;
  updatedBy: number | null;
  updatedAt: string;
};

// Whitelist of action keys the live SMS pipeline actually renders against.
// The DB also contains some orphan rows from earlier prototyping; filtering
// here keeps the admin page focused on the 16 templates that go out today.
const ACTIVE_ACTION_KEYS = new Set([
  "submission_received.standard",
  "submission_received.nla",
  "submission_received.external_warranty",
  "ticket_claimed.standard",
  "ticket_claimed.two_stage",
  "ticket_claimed.resubmission",
  "submission_approved.stage1",
  "ticket_approved.with_auth_and_rgc",
  "ticket_approved.rgc_only",
  "ticket_approved.auth_only",
  "nla_approval",
  "ticket_rejected",
  "ticket_rejected_closed.with_cash_call",
  "ticket_rejected_closed.no_cash_call",
  "ticket_invalid",
  "nla_invalid",
  // Tyler 2026-04-29: NLA second-stage resolution templates. Previously
  // these messages were inline strings inside routes.ts; now each one is
  // an admin-editable template surfaced in its own family below.
  "nla_replacement_submitted",
  "nla_replacement_tech_initiates",
  "nla_part_found_vrs_ordered",
  "nla_part_found_tech_orders",
  "nla_rfr_eligible",
  "nla_pcard_confirmed.generic",
  "nla_rejected",
]);

// Group action keys into the user-facing event families Tyler called out:
// initial submission, agent pickup, stage 1, stage 2, rejected/invalid.
const FAMILIES: { id: string; label: string; description: string; matches: (key: string) => boolean }[] = [
  {
    id: "submission_received",
    label: "1. Initial submission",
    description: "Sent automatically the moment a technician submits a ticket.",
    matches: (k) => k.startsWith("submission_received."),
  },
  {
    id: "ticket_claimed",
    label: "2. Agent pickup",
    description: "Sent when a VRS agent claims the ticket and starts working it.",
    matches: (k) => k.startsWith("ticket_claimed."),
  },
  {
    id: "submission_approved",
    label: "3. Stage 1 approval (clear to leave)",
    description: "Two-stage Sears Protect only — sent after the agent OKs the photos/details.",
    matches: (k) => k.startsWith("submission_approved."),
  },
  {
    id: "ticket_approved",
    label: "4. Stage 2 / final approval (auth code)",
    description: "Sent when the auth code and/or RGC code is ready.",
    matches: (k) => k.startsWith("ticket_approved.") || k === "nla_approval",
  },
  {
    id: "rejected_invalid",
    label: "5. Rejected, closed, or invalid",
    description: "Outcomes when the ticket can't be approved as submitted.",
    matches: (k) =>
      k === "ticket_rejected" ||
      k.startsWith("ticket_rejected_closed") ||
      k === "ticket_invalid" ||
      k === "nla_invalid",
  },
  // Tyler 2026-04-29: dedicated family for the NLA second-stage parts-team
  // dispositions. These are sent later in the lifecycle than the
  // submission_received.nla / nla_approval messages above (which are
  // grouped under their respective stages) — they're the final outcome
  // text the technician sees once the parts team has resolved the NLA.
  {
    id: "nla_resolution",
    label: "6. NLA parts-team resolution",
    description:
      "Sent after the VRS parts team dispositions an NLA request — replacement, part-found, RFR, P-card outcome, or NLA-specific rejection.",
    matches: (k) =>
      k === "nla_replacement_submitted" ||
      k === "nla_replacement_tech_initiates" ||
      k === "nla_part_found_vrs_ordered" ||
      k === "nla_part_found_tech_orders" ||
      k === "nla_rfr_eligible" ||
      k === "nla_pcard_confirmed.generic" ||
      k === "nla_rejected",
  },
];

function previewBody(body: string, max = 220): string {
  const trimmed = body.replace(/\s+/g, " ").trim();
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

export default function AdminCommunicationsPage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [editing, setEditing] = useState<CommunicationTemplate | null>(null);
  const [draftBody, setDraftBody] = useState("");
  const [draftReason, setDraftReason] = useState("");

  const { data: templates, isLoading, isError, error, refetch } = useQuery<CommunicationTemplate[]>({
    queryKey: ["/api/admin/communication-templates"],
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, body, editReason }: { id: number; body: string; editReason: string }) => {
      const res = await apiRequest(
        "PATCH",
        `/api/admin/communication-templates/${id}`,
        { body, editReason: editReason || undefined }
      );
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/communication-templates"] });
      toast({ title: "Template saved", description: "New version is live for the next SMS sent." });
      setEditing(null);
      setDraftBody("");
      setDraftReason("");
    },
    onError: (err: any) => {
      toast({
        title: "Save failed",
        description: err?.message ?? "Could not save the template. Please try again.",
        variant: "destructive",
      });
    },
  });

  const grouped = useMemo(() => {
    if (!templates) return [];
    const active = templates.filter((t) => ACTIVE_ACTION_KEYS.has(t.actionKey));
    return FAMILIES.map((fam) => ({
      ...fam,
      rows: active.filter((t) => fam.matches(t.actionKey)),
    })).filter((fam) => fam.rows.length > 0);
  }, [templates]);

  if (!user || (user.role !== "admin" && user.role !== "super_admin")) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="max-w-md">
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">You do not have access to this page.</p>
            <Button className="mt-4" onClick={() => navigate("/admin/dashboard")} data-testid="button-back-no-access">
              Back
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const openEditor = (tpl: CommunicationTemplate) => {
    setEditing(tpl);
    setDraftBody(tpl.body);
    setDraftReason("");
  };

  const closeEditor = () => {
    if (updateMutation.isPending) return;
    setEditing(null);
    setDraftBody("");
    setDraftReason("");
  };

  const onSave = () => {
    if (!editing) return;
    if (draftBody.trim().length === 0) {
      toast({ title: "Body required", description: "The template body cannot be empty.", variant: "destructive" });
      return;
    }
    updateMutation.mutate({ id: editing.id, body: draftBody, editReason: draftReason });
  };

  const onResetDraft = () => {
    if (!editing) return;
    setDraftBody(editing.body);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b sticky top-0 z-10 bg-background/95 backdrop-blur">
        <div className="container mx-auto px-4 py-4 flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/admin/dashboard")}
            data-testid="button-back-to-dashboard"
            aria-label="Back to admin dashboard"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            <div>
              <h1 className="text-lg font-semibold leading-none" data-testid="text-page-title">
                Communication Templates
              </h1>
              <p className="text-xs text-muted-foreground mt-1">
                Edit the SMS messages that go out to technicians at each step.
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-5xl space-y-8">
        {isLoading && (
          <div className="space-y-4" data-testid="status-loading">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        )}

        {!isLoading && isError && (
          <Card>
            <CardContent className="pt-6 space-y-3">
              <p className="text-sm text-destructive font-medium" data-testid="status-load-error">
                Could not load templates.
              </p>
              <p className="text-sm text-muted-foreground">
                {(error as any)?.message ?? "Network or server error."}
              </p>
              <Button onClick={() => refetch()} size="sm" data-testid="button-retry-load">
                Retry
              </Button>
            </CardContent>
          </Card>
        )}

        {!isLoading && !isError && grouped.length === 0 && (
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground" data-testid="text-empty-state">
                No templates have been seeded yet. Restart the workflow to populate defaults.
              </p>
            </CardContent>
          </Card>
        )}

        {grouped.map((fam) => (
          <section key={fam.id} data-testid={`section-${fam.id}`}>
            <div className="mb-3">
              <h2 className="text-base font-semibold" data-testid={`text-family-${fam.id}`}>
                {fam.label}
              </h2>
              <p className="text-xs text-muted-foreground mt-1">{fam.description}</p>
            </div>
            <div className="space-y-3">
              {fam.rows.map((tpl) => (
                <Card key={tpl.id} className="hover-elevate active-elevate-2" data-testid={`card-template-${tpl.id}`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <CardTitle className="text-sm font-medium" data-testid={`text-template-name-${tpl.id}`}>
                          {tpl.title ?? tpl.actionKey}
                        </CardTitle>
                        <CardDescription className="text-xs mt-1 font-mono" data-testid={`text-action-key-${tpl.id}`}>
                          {tpl.actionKey}
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline" className="uppercase text-[10px] tracking-wide" data-testid={`badge-channel-${tpl.id}`}>
                          {tpl.channel}
                        </Badge>
                        {tpl.isDefault ? (
                          <Badge variant="secondary" className="text-[10px]" data-testid={`badge-default-${tpl.id}`}>
                            Default
                          </Badge>
                        ) : (
                          <Badge className="text-[10px]" data-testid={`badge-edited-${tpl.id}`}>
                            Edited by admin · v{tpl.currentVersion}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0 pb-4">
                    <p
                      className="text-xs text-muted-foreground whitespace-pre-line line-clamp-3 mb-3"
                      data-testid={`text-body-preview-${tpl.id}`}
                    >
                      {previewBody(tpl.body)}
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openEditor(tpl)}
                      data-testid={`button-edit-${tpl.id}`}
                    >
                      Edit message
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        ))}
      </main>

      <Dialog open={!!editing} onOpenChange={(open) => !open && closeEditor()}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {editing && (
            <>
              <DialogHeader>
                <DialogTitle data-testid="text-modal-title">{editing.title ?? editing.actionKey}</DialogTitle>
                <DialogDescription className="font-mono text-xs">{editing.actionKey}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="template-body">Message body</Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={onResetDraft}
                      disabled={draftBody === editing.body || updateMutation.isPending}
                      data-testid="button-reset-draft"
                    >
                      <RotateCcw className="h-3 w-3 mr-1" />
                      Reset to current
                    </Button>
                  </div>
                  <Textarea
                    id="template-body"
                    value={draftBody}
                    onChange={(e) => setDraftBody(e.target.value)}
                    rows={10}
                    className="font-mono text-xs"
                    disabled={updateMutation.isPending}
                    data-testid="textarea-template-body"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {draftBody.length} characters · use <code>{"{varName}"}</code> for runtime values.
                  </p>
                </div>

                {editing.variables && editing.variables.length > 0 && (
                  <div className="space-y-2">
                    <Label>Available variables</Label>
                    <div className="rounded-md border bg-muted/40 p-3 space-y-2">
                      {editing.variables.map((v) => (
                        <div key={v.name} className="text-xs" data-testid={`variable-${v.name}`}>
                          <div className="flex items-center gap-2 flex-wrap">
                            <code className="font-mono bg-background px-1.5 py-0.5 rounded border">{`{${v.name}}`}</code>
                            {v.required ? (
                              <Badge variant="secondary" className="text-[9px] uppercase">Required</Badge>
                            ) : (
                              <Badge variant="outline" className="text-[9px] uppercase">Optional</Badge>
                            )}
                          </div>
                          {v.description && (
                            <p className="text-muted-foreground mt-1 ml-1">{v.description}</p>
                          )}
                          {v.sample && (
                            <p className="text-muted-foreground mt-1 ml-1">
                              Example: <span className="font-mono">{v.sample.replace(/\n/g, "\\n")}</span>
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="edit-reason">Reason for edit (optional)</Label>
                  <Input
                    id="edit-reason"
                    value={draftReason}
                    onChange={(e) => setDraftReason(e.target.value)}
                    placeholder="e.g. Tightened up wording per Tyler"
                    maxLength={500}
                    disabled={updateMutation.isPending}
                    data-testid="input-edit-reason"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Saved with the version history so you can answer "why did this change?" later.
                  </p>
                </div>
              </div>
              <DialogFooter className="gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeEditor}
                  disabled={updateMutation.isPending}
                  data-testid="button-cancel-edit"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={onSave}
                  disabled={updateMutation.isPending || draftBody.trim().length === 0 || draftBody === editing.body}
                  data-testid="button-save-template"
                >
                  {updateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Save new version
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
