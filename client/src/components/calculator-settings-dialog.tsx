// =============================================================================
// CalculatorSettingsDialog — agent-side UI for managing the encrypted creds
// VRS uses to auto-login to the Streamlit Repair/Replace Calculator iframe.
// =============================================================================
// Endpoints:
//   GET    /api/agent/credentials/calculator         -> { exists: bool, usernameHint?: string }
//   POST   /api/agent/credentials/calculator         -> { ok: true, usernameHint }
//   DELETE /api/agent/credentials/calculator         -> { ok: true }
// =============================================================================

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Trash2, Save, ShieldCheck } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export interface CalculatorSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface StatusResponse {
  exists: boolean;
  usernameHint?: string;
}

export function CalculatorSettingsDialog({
  open,
  onOpenChange,
}: CalculatorSettingsDialogProps) {
  const { toast } = useToast();
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setUsername("");
    setPassword("");
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await apiRequest("GET", "/api/agent/credentials/calculator");
        const data = (await res.json()) as StatusResponse;
        if (!cancelled) setStatus(data);
      } catch (e) {
        if (!cancelled) {
          toast({
            title: "Could not load calculator status",
            description: e instanceof Error ? e.message : "Unknown error",
            variant: "destructive",
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, toast]);

  const onSave = async () => {
    if (!username.trim() || !password.trim()) {
      toast({
        title: "Missing values",
        description: "Both username and password are required.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      const res = await apiRequest("POST", "/api/agent/credentials/calculator", {
        username,
        password,
      });
      const data = (await res.json()) as { ok: boolean; usernameHint: string };
      setStatus({ exists: true, usernameHint: data.usernameHint });
      setPassword("");
      toast({
        title: "Calculator credentials saved",
        description: `Stored as ${data.usernameHint}`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/agent/credentials/calculator"] });
    } catch (e) {
      toast({
        title: "Could not save credentials",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    setDeleting(true);
    try {
      await apiRequest("DELETE", "/api/agent/credentials/calculator");
      setStatus({ exists: false });
      setUsername("");
      setPassword("");
      toast({ title: "Calculator credentials removed" });
      queryClient.invalidateQueries({ queryKey: ["/api/agent/credentials/calculator"] });
    } catch (e) {
      toast({
        title: "Could not delete credentials",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="dialog-calculator-settings">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" />
            Calculator Auto-Login
          </DialogTitle>
          <DialogDescription>
            Save the username and password you use for the Repair/Replace Calculator. VRS will encrypt them and use them to pre-fill (and where possible auto-submit) the calculator login when you open the Calculator tab.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-6 text-muted-foreground" data-testid="loading-calc-status">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            Loading…
          </div>
        ) : (
          <div className="space-y-4">
            {status?.exists && (
              <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm" data-testid="text-calc-status-existing">
                Currently saved as <strong>{status.usernameHint}</strong>. Saving again will replace the existing credentials.
              </div>
            )}
            <div>
              <Label htmlFor="calc-username">Calculator username</Label>
              <Input
                id="calc-username"
                autoComplete="off"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={status?.exists ? "Re-enter to replace" : "e.g. mthoma2"}
                data-testid="input-calc-username"
              />
            </div>
            <div>
              <Label htmlFor="calc-password">Calculator password</Label>
              <Input
                id="calc-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                data-testid="input-calc-password"
              />
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Encrypted at rest with AES-256-GCM (key derived from server SESSION_SECRET via scrypt). The plaintext only ever leaves the server momentarily, sent over HTTPS to your browser when the Calculator tab requests an auto-login.
            </p>
          </div>
        )}

        <DialogFooter className="sm:justify-between">
          {status?.exists ? (
            <Button
              variant="outline"
              size="sm"
              onClick={onDelete}
              disabled={deleting || saving}
              data-testid="button-calc-delete"
            >
              {deleting ? (
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              ) : (
                <Trash2 className="w-3 h-3 mr-1" />
              )}
              Remove
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              data-testid="button-calc-cancel"
            >
              Cancel
            </Button>
            <Button
              onClick={onSave}
              disabled={saving || deleting}
              data-testid="button-calc-save"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
