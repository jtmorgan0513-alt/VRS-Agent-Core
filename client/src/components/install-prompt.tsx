import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "vrs-install-prompt-dismissed";

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem(DISMISS_KEY);
    if (dismissed) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowBanner(true);
    };

    window.addEventListener("beforeinstallprompt", handler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setShowBanner(false);
      localStorage.setItem(DISMISS_KEY, "true");
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShowBanner(false);
    localStorage.setItem(DISMISS_KEY, "true");
  };

  if (!showBanner) return null;

  return (
    <div
      data-testid="install-prompt-banner"
      className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-between gap-2 px-4 py-2 shadow-lg"
      style={{ backgroundColor: "#003366" }}
    >
      <span className="text-white text-sm font-medium">Install VRS Submit</span>
      <div className="flex items-center gap-2">
        <Button
          data-testid="button-install"
          size="sm"
          variant="outline"
          className="text-white border-white bg-transparent"
          onClick={handleInstall}
        >
          Install
        </Button>
        <Button
          data-testid="button-dismiss-install"
          size="icon"
          variant="ghost"
          className="text-white"
          onClick={handleDismiss}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
