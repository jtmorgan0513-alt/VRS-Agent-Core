// =============================================================================
// CalculatorIframe — embeds the Streamlit Repair/Replace Calculator with a
// best-effort, security-conscious auto-login bridge:
//
//   * postMessage injection — posts a typed envelope to the iframe asking it
//     to set `text_input_1` / `text_input_2`, fire synthetic InputEvents, and
//     click the Sign In button. Only works if the calculator opts in by
//     adding a window message listener; harmless otherwise.
//
// Hardening notes (from architect review 2026-04-26):
//   * We DO NOT put credentials in the iframe `src` query string. URL params
//     would leak to browser history, intermediary logs, and the calculator
//     server's access logs.
//   * postMessage targets the EXACT calculator origin (parsed once from
//     CALCULATOR_BASE_URL), never `"*"`. If a redirect ever moves the iframe
//     to a different origin, the credentials are silently dropped.
//
// If postMessage isn't picked up by the calculator, the agent always has the
// credentials in their settings dialog and can paste them manually via the
// Copy buttons in the iframe header.
// =============================================================================

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Settings, AlertTriangle, Copy, Check } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export const CALCULATOR_BASE_URL = "https://repairreplacecalculator.replit.app/";
const CALCULATOR_ORIGIN = (() => {
  try {
    return new URL(CALCULATOR_BASE_URL).origin;
  } catch {
    return "";
  }
})();

export interface CalculatorIframeProps {
  /** Called when the user clicks the Settings button in the empty / error state. */
  onOpenSettings: () => void;
}

interface RevealResponse {
  exists: boolean;
  username?: string;
  password?: string;
  usernameHint?: string;
}

export function CalculatorIframe({ onOpenSettings }: CalculatorIframeProps) {
  const { toast } = useToast();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [creds, setCreds] = useState<RevealResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"u" | "p" | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await apiRequest(
          "POST",
          "/api/agent/credentials/calculator/reveal"
        );
        const data = (await res.json()) as RevealResponse;
        if (!cancelled) setCreds(data);
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Failed to load credentials");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // iframe URL is the calculator base only — credentials are NEVER appended
  // as query params (they would leak to history + remote access logs).
  const iframeSrc = CALCULATOR_BASE_URL;

  // postMessage auto-login bridge — fires once on iframe load. The calculator
  // app only acts on this if it has registered a `message` listener that
  // recognises our envelope. If it ignores us, no harm done.
  //
  // SECURITY: targetOrigin is pinned to the calculator origin, never "*". If
  // the iframe was navigated to a different origin (redirect, takeover), the
  // browser will refuse to deliver the message and the credentials stay put.
  const handleIframeLoad = () => {
    if (!iframeRef.current?.contentWindow || !creds?.exists) return;
    if (!creds.username || !creds.password) return;
    if (!CALCULATOR_ORIGIN) return; // safety: refuse if origin couldn't be parsed
    try {
      iframeRef.current.contentWindow.postMessage(
        {
          source: "vrs-agent-core",
          type: "calculator-autologin",
          version: 1,
          payload: {
            username: creds.username,
            password: creds.password,
            // Hints for a cooperative receiver — see docs/intake_form_field_map.md.
            usernameInputId: "text_input_1",
            passwordInputId: "text_input_2",
            submitButtonText: "Sign In",
          },
        },
        CALCULATOR_ORIGIN
      );
    } catch {
      // Cross-origin guard threw — expected in some browsers, ignore.
    }
  };

  const copyToClipboard = async (kind: "u" | "p", value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      toast({
        title: "Copy failed",
        description: "Your browser blocked clipboard access.",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground" data-testid="loading-calculator">
        <Loader2 className="w-4 h-4 animate-spin mr-2" />
        Loading calculator…
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0" data-testid="container-calculator">
      <div className="px-3 py-2 border-b bg-muted/30 flex items-center gap-2 flex-wrap">
        {creds?.exists && creds.username && creds.password ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
            <span data-testid="text-calc-status-saved">
              Auto-login as <strong>{creds.usernameHint}</strong>
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => copyToClipboard("u", creds.username!)}
              data-testid="button-calc-copy-username"
            >
              {copied === "u" ? <Check className="w-3 h-3 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
              Copy username
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => copyToClipboard("p", creds.password!)}
              data-testid="button-calc-copy-password"
            >
              {copied === "p" ? <Check className="w-3 h-3 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
              Copy password
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-muted-foreground" data-testid="text-calc-status-empty">
            <AlertTriangle className="w-3 h-3 text-amber-500" />
            No saved credentials — sign in manually or save them in Settings.
          </div>
        )}
        <Button
          size="sm"
          variant="outline"
          className="ml-auto h-7 text-xs"
          onClick={onOpenSettings}
          data-testid="button-calc-open-settings"
        >
          <Settings className="w-3 h-3 mr-1" />
          Settings
        </Button>
      </div>
      {error && (
        <div className="px-3 py-2 text-xs text-destructive border-b bg-destructive/5" data-testid="error-calc-creds">
          {error}
        </div>
      )}
      <iframe
        ref={iframeRef}
        key={creds?.username ?? "no-creds" /* re-mount when creds change so postMessage runs again */}
        src={iframeSrc}
        title="Repair/Replace Calculator"
        className="flex-1 w-full border-0"
        sandbox="allow-forms allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        onLoad={handleIframeLoad}
        data-testid="iframe-calculator"
      />
    </div>
  );
}
