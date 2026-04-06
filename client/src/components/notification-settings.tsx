import { useState, useEffect } from "react";
import { Settings, Volume2, Volume1, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  TONE_OPTIONS,
  type ToneId,
  playNotificationDing,
  playTonePreview,
  getNotificationVolume,
  getSelectedTone,
  setCachedVolume,
  setCachedTone,
  loadNotificationSettings,
} from "@/lib/websocket";
import { apiRequest } from "@/lib/queryClient";

export default function NotificationSettings() {
  const [open, setOpen] = useState(false);
  const [selectedTone, setTone] = useState<ToneId>(() => getSelectedTone());
  const [notifVolume, setNotifVolume] = useState(() => getNotificationVolume());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      loadNotificationSettings().then(({ tone, volume }) => {
        setTone(tone);
        setNotifVolume(volume);
      });
    }
  }, [open]);

  const saveTone = async (toneId: ToneId) => {
    setTone(toneId);
    setCachedTone(toneId);
    playTonePreview(toneId);
    setSaving(true);
    try {
      await apiRequest("PUT", "/api/settings/notification-tone", { tone: toneId });
    } catch {}
    setSaving(false);
  };

  const saveVolume = async () => {
    setSaving(true);
    try {
      await apiRequest("PUT", "/api/settings/notification-tone", { volume: notifVolume });
    } catch {}
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2"
          data-testid="btn-notification-settings"
        >
          <Settings className="w-4 h-4" />
          <span>Sound Settings</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Notification Sound Settings</DialogTitle>
          <DialogDescription>Choose your alert tone and volume level for new ticket notifications.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <span className="text-sm font-medium">Alert Tone</span>
            <div className="grid grid-cols-1 gap-1">
              {TONE_OPTIONS.map((tone) => (
                <button
                  key={tone.id}
                  onClick={() => saveTone(tone.id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                    selectedTone === tone.id
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted text-foreground"
                  }`}
                  data-testid={`btn-tone-${tone.id}`}
                >
                  <Volume2 className="w-3.5 h-3.5 shrink-0" />
                  {tone.label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <span className="text-sm font-medium">Volume</span>
            <div className="flex items-center gap-3">
              {notifVolume === 0 ? (
                <VolumeX className="w-4 h-4 text-muted-foreground shrink-0" />
              ) : notifVolume < 0.4 ? (
                <Volume1 className="w-4 h-4 text-muted-foreground shrink-0" />
              ) : (
                <Volume2 className="w-4 h-4 text-muted-foreground shrink-0" />
              )}
              <input
                type="range"
                min="0"
                max="100"
                value={Math.round(notifVolume * 100)}
                onChange={(e) => {
                  const v = parseInt(e.target.value) / 100;
                  setNotifVolume(v);
                  setCachedVolume(v);
                }}
                onMouseUp={saveVolume}
                onTouchEnd={saveVolume}
                className="w-full h-2 accent-primary cursor-pointer"
                data-testid="slider-notification-volume"
              />
              <span className="text-sm text-muted-foreground w-10 text-right shrink-0" data-testid="text-volume-level">
                {Math.round(notifVolume * 100)}%
              </span>
            </div>
          </div>
          {saving && (
            <p className="text-xs text-muted-foreground text-center">Saving...</p>
          )}
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => playNotificationDing()}
            data-testid="btn-test-sound"
          >
            <Volume2 className="w-3.5 h-3.5 mr-1.5" />
            Test Sound
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
