import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
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
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShowBanner(false);
  };

  if (!showBanner) return null;

  return (
    <div
      data-testid="install-prompt-banner"
      className="fixed bottom-16 left-0 right-0 z-50 flex items-center justify-between gap-2 px-4 py-3"
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
