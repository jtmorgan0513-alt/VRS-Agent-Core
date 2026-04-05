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

const NOTIFICATION_SOUND_DATA = (() => {
  const sampleRate = 8000;
  const duration = 0.6;
  const samples = sampleRate * duration;
  const buffer = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;
    const freq1 = t < 0.1 ? 880 : 1100;
    const freq2 = 1320;
    const envelope = Math.exp(-t * 5);
    let sample = Math.sin(2 * Math.PI * freq1 * t) * envelope * 0.5;
    if (t >= 0.15) {
      sample += Math.sin(2 * Math.PI * freq2 * t) * Math.exp(-(t - 0.15) * 5) * 0.5;
    }
    buffer[i] = sample;
  }
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
})();

function playWithAudioElement() {
  try {
    if (!notificationAudio) {
      notificationAudio = new Audio(NOTIFICATION_SOUND_DATA);
      notificationAudio.volume = 0.7;
    }
    notificationAudio.currentTime = 0;
    notificationAudio.play().catch(() => {});
  } catch {}
}

function playWithWebAudio() {
  try {
    if (!audioCtx) {
      audioCtx = new AudioContext();
    }
    const ctx = audioCtx;

    if (ctx.state === "suspended") {
      ctx.resume().then(() => playTone(ctx)).catch(() => {});
      return;
    }
    playTone(ctx);
  } catch {}
}

function playTone(ctx: AudioContext) {
  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  const gain = ctx.createGain();

  osc1.type = "sine";
  osc1.frequency.setValueAtTime(880, ctx.currentTime);
  osc1.frequency.setValueAtTime(1100, ctx.currentTime + 0.1);

  osc2.type = "sine";
  osc2.frequency.setValueAtTime(1320, ctx.currentTime + 0.15);

  gain.gain.setValueAtTime(0.5, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);

  osc1.connect(gain);
  osc2.connect(gain);
  gain.connect(ctx.destination);

  osc1.start(ctx.currentTime);
  osc2.start(ctx.currentTime + 0.15);
  osc1.stop(ctx.currentTime + 0.6);
  osc2.stop(ctx.currentTime + 0.6);
}

export function playNotificationDing() {
  playWithAudioElement();
  if (document.visibilityState === "visible") {
    playWithWebAudio();
  }
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
