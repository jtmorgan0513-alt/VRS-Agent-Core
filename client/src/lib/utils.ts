import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function safeDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return d;
}

export function formatDate(value: string | Date | null | undefined, options?: Intl.DateTimeFormatOptions): string {
  const d = safeDate(value);
  if (!d) return "—";
  return d.toLocaleString(undefined, options);
}

export function formatDateShort(value: string | Date | null | undefined): string {
  const d = safeDate(value);
  if (!d) return "—";
  return d.toLocaleDateString();
}

export function downloadPhotoUrl(url: string, filenameBase: string) {
  (async () => {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      const ext = blob.type.includes("png") ? "png" : blob.type.includes("webp") ? "webp" : "jpg";
      a.download = `${filenameBase}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch {
      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener";
      a.click();
    }
  })();
}
