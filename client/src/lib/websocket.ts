import { useEffect, useRef, useCallback } from "react";
import { getToken } from "./auth";

type WSEventHandler = (payload: any) => void;

const handlers = new Map<string, Set<WSEventHandler>>();
let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_DELAY = 30000;

function getWsUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const token = getToken();
  return `${protocol}//${window.location.host}/ws?token=${encodeURIComponent(token || "")}`;
}

function connect() {
  const token = getToken();
  if (!token) return;

  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  try {
    ws = new WebSocket(getWsUrl());

    ws.onopen = () => {
      reconnectAttempts = 0;
      console.log("[ws] Connected");
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type) {
          const typeHandlers = handlers.get(data.type);
          if (typeHandlers) {
            typeHandlers.forEach((handler) => handler(data.payload));
          }
        }
      } catch {}
    };

    ws.onclose = (event) => {
      ws = null;
      if (event.code !== 4000 && event.code !== 4001 && event.code !== 4002 && event.code !== 4003) {
        scheduleReconnect();
      }
    };

    ws.onerror = () => {
      if (ws) {
        ws.close();
      }
    };
  } catch {}
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), MAX_RECONNECT_DELAY);
  reconnectAttempts++;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    const token = getToken();
    if (token) {
      connect();
    }
  }, delay);
}

export function disconnectWs() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  reconnectAttempts = 0;
  if (ws) {
    ws.close(4000, "User logout");
    ws = null;
  }
}

export function connectWs() {
  connect();
}

export function onWsEvent(type: string, handler: WSEventHandler) {
  if (!handlers.has(type)) {
    handlers.set(type, new Set());
  }
  handlers.get(type)!.add(handler);
  return () => {
    const typeHandlers = handlers.get(type);
    if (typeHandlers) {
      typeHandlers.delete(handler);
      if (typeHandlers.size === 0) {
        handlers.delete(type);
      }
    }
  };
}

let audioCtx: AudioContext | null = null;
let notificationAudio: HTMLAudioElement | null = null;

export type ToneId = "chime" | "bell" | "pulse" | "cascade" | "alert";

export const TONE_OPTIONS: { id: ToneId; label: string }[] = [
  { id: "chime", label: "Chime" },
  { id: "bell", label: "Bell" },
  { id: "pulse", label: "Pulse" },
  { id: "cascade", label: "Cascade" },
  { id: "alert", label: "Alert" },
];

let cachedTone: ToneId = "chime";
let cachedVolume = 0.5;
let settingsLoaded = false;

export async function loadNotificationSettings(): Promise<{ tone: ToneId; volume: number }> {
  try {
    const token = getToken();
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch("/api/settings/notification-tone", { headers });
    if (res.ok) {
      const data = await res.json();
      cachedTone = TONE_OPTIONS.some(o => o.id === data.tone) ? data.tone : "chime";
      cachedVolume = typeof data.volume === "number" ? data.volume : 0.5;
      settingsLoaded = true;
    }
  } catch {}
  return { tone: cachedTone, volume: cachedVolume };
}

export function getNotificationVolume(): number {
  return cachedVolume;
}

export function getSelectedTone(): ToneId {
  return cachedTone;
}

export function setCachedVolume(vol: number) {
  cachedVolume = Math.max(0, Math.min(1, vol));
  if (notificationAudio) {
    notificationAudio.volume = cachedVolume;
  }
}

export function setCachedTone(tone: ToneId) {
  cachedTone = tone;
  notificationAudio = null;
}

if (!settingsLoaded) {
  loadNotificationSettings();
}

function generateWav(fillBuffer: (buffer: Float32Array, sampleRate: number) => void, duration: number): string {
  const sampleRate = 8000;
  const samples = Math.floor(sampleRate * duration);
  const buffer = new Float32Array(samples);
  fillBuffer(buffer, sampleRate);
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = samples * blockAlign;
  const headerSize = 44;
  const arr = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(arr);
  const writeStr = (offset: number, str: string) => { for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i)); };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);
  for (let i = 0; i < samples; i++) {
    const s = Math.max(-1, Math.min(1, buffer[i]));
    view.setInt16(headerSize + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
  const blob = new Blob([arr], { type: "audio/wav" });
  return URL.createObjectURL(blob);
}

const toneGenerators: Record<ToneId, () => string> = {
  chime: () => generateWav((buf, sr) => {
    for (let i = 0; i < buf.length; i++) {
      const t = i / sr;
      const f1 = t < 0.1 ? 880 : 1100;
      const env = Math.exp(-t * 5);
      buf[i] = Math.sin(2 * Math.PI * f1 * t) * env * 0.5;
      if (t >= 0.15) buf[i] += Math.sin(2 * Math.PI * 1320 * t) * Math.exp(-(t - 0.15) * 5) * 0.5;
    }
  }, 0.6),

  bell: () => generateWav((buf, sr) => {
    for (let i = 0; i < buf.length; i++) {
      const t = i / sr;
      const env = Math.exp(-t * 3);
      buf[i] = (Math.sin(2 * Math.PI * 523 * t) * 0.4
        + Math.sin(2 * Math.PI * 659 * t) * 0.25
        + Math.sin(2 * Math.PI * 784 * t) * 0.2
        + Math.sin(2 * Math.PI * 1047 * t) * 0.15) * env;
    }
  }, 0.8),

  pulse: () => generateWav((buf, sr) => {
    for (let i = 0; i < buf.length; i++) {
      const t = i / sr;
      const beat = Math.sin(2 * Math.PI * 4 * t);
      const carrier = Math.sin(2 * Math.PI * 660 * t);
      const env = Math.exp(-t * 4);
      buf[i] = carrier * (0.3 + beat * 0.2) * env;
    }
  }, 0.7),

  cascade: () => generateWav((buf, sr) => {
    for (let i = 0; i < buf.length; i++) {
      const t = i / sr;
      const freq = 400 + t * 1200;
      const env = t < 0.3 ? Math.sin(Math.PI * t / 0.3) : Math.exp(-(t - 0.3) * 5);
      buf[i] = Math.sin(2 * Math.PI * freq * t) * env * 0.5;
    }
  }, 0.6),

  alert: () => generateWav((buf, sr) => {
    for (let i = 0; i < buf.length; i++) {
      const t = i / sr;
      const noteIdx = Math.floor(t / 0.15);
      const noteT = t - noteIdx * 0.15;
      const freqs = [784, 988, 1175, 988];
      const freq = freqs[noteIdx % freqs.length];
      const env = Math.exp(-noteT * 10) * 0.5;
      buf[i] = Math.sin(2 * Math.PI * freq * t) * env;
    }
  }, 0.6),
};

const toneCache: Partial<Record<ToneId, string>> = {};

function getToneData(tone: ToneId): string {
  if (!toneCache[tone]) {
    toneCache[tone] = toneGenerators[tone]();
  }
  return toneCache[tone]!;
}

function playWithAudioElement() {
  try {
    const tone = getSelectedTone();
    const data = getToneData(tone);
    if (!notificationAudio || notificationAudio.src !== data) {
      notificationAudio = new Audio(data);
    }
    notificationAudio.volume = cachedVolume;
    notificationAudio.currentTime = 0;
    notificationAudio.play().catch(() => {});
  } catch {}
}

export function playNotificationDing() {
  playWithAudioElement();
}

export function playTonePreview(tone: ToneId) {
  try {
    const data = getToneData(tone);
    const audio = new Audio(data);
    audio.volume = cachedVolume;
    audio.play().catch(() => {});
  } catch {}
}

export function requestNotificationPermission() {
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission().catch(() => {});
  }
}

export function showBrowserNotification(title: string, body?: string) {
  if (document.visibilityState !== "visible" && "Notification" in window && Notification.permission === "granted") {
    try {
      const n = new Notification(title, {
        body,
        icon: "/favicon.ico",
        tag: "vrs-notification",
        requireInteraction: false,
      });
      n.onclick = () => {
        window.focus();
        n.close();
      };
      setTimeout(() => n.close(), 10000);
    } catch {}
  }
}

export function useWebSocket(role?: string) {
  const isConnected = useRef(false);

  useEffect(() => {
    if (!role || (role !== "vrs_agent" && role !== "admin" && role !== "super_admin" && role !== "technician")) {
      return;
    }

    const token = getToken();
    if (!token) return;

    if (!isConnected.current) {
      connectWs();
      isConnected.current = true;
    }

    return () => {
    };
  }, [role]);

  const subscribe = useCallback((type: string, handler: WSEventHandler) => {
    return onWsEvent(type, handler);
  }, []);

  return { subscribe };
}
