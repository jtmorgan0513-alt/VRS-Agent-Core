import { Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface WhatsNewModalProps {
  open: boolean;
  onDismiss: () => void;
  version: string;
}

const FEATURES = {
  "1.0.0": [
    {
      title: "Digital Authorization Submissions",
      description:
        "Submit requests with photo/video evidence from your phone",
    },
    {
      title: "Two-Stage Review Workflow",
      description:
        "Streamlined approval process with real-time SMS notifications",
    },
    {
      title: "Admin Analytics Dashboard",
      description:
        "Track submission volumes, approval rates, and processing times",
    },
    {
      title: "PWA Support",
      description: "Install VRS Express on your phone for quick access",
    },
    {
      title: "Interactive Help System",
      description:
        "Onboarding wizard, contextual help, and comprehensive help center",
    },
  ],
} as const;

export default function WhatsNewModal({
  open,
  onDismiss,
  version,
}: WhatsNewModalProps) {
  const features = FEATURES[version as keyof typeof FEATURES] || [];

  return (
    <Dialog open={open} onOpenChange={onDismiss}>
      <DialogContent data-testid="whats-new-modal" className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>What's New in v{version}</DialogTitle>
          <DialogDescription>
            Check out the latest features and improvements
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {features.map((feature, index) => (
            <div key={index} className="flex gap-3">
              <div className="flex-shrink-0 pt-1">
                <Sparkles className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <h4 className="font-medium text-base">{feature.title}</h4>
                <p className="text-sm text-muted-foreground mt-1">
                  {feature.description}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end pt-4">
          <Button onClick={onDismiss} data-testid="button-whats-new-dismiss">
            Got it
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
