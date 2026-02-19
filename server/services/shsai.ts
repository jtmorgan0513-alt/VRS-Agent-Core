import crypto from "crypto";

const SHSAI_BASE_URL = "https://ais.tellurideplatform.com/tell/api/hs/routing/v1";

function generateTrackId(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function generateDeviceInfo(): string {
  const uuid = crypto.randomUUID();
  return `${uuid}~~Server~~nodejs~~VRS~~1`;
}

export interface ShsaiSession {
  trackId: string;
  sessionId: string;
  threadId: string;
  deviceInfo: string;
}

export async function initSession(agentUserId: string): Promise<ShsaiSession> {
  const trackId = generateTrackId();
  const deviceInfo = generateDeviceInfo();

  const response = await fetch(`${SHSAI_BASE_URL}/init`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json, text/plain, */*",
      "deviceinfo": deviceInfo,
    },
    body: JSON.stringify({
      chat_bot_type: "HS_ROUTE_ASSISTANT",
      trackId,
      parameters: {
        userId: agentUserId,
        techId: "",
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`SHSAI init failed: ${response.status} ${response.statusText}`);
  }

  const sessionId = response.headers.get("sessionid");
  const data = await response.json();

  return {
    trackId,
    sessionId: sessionId || data.session_id || data.sessionId || "",
    threadId: data.thread_id || data.threadId || "",
    deviceInfo,
  };
}

async function sseAssist(
  session: ShsaiSession,
  userMessage: string
): Promise<string> {
  const response = await fetch(`${SHSAI_BASE_URL}/sse/assist`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "text/event-stream",
      "deviceinfo": session.deviceInfo,
      "sessionid": session.sessionId,
    },
    body: JSON.stringify({
      chat_bot_type: "HS_ROUTE_ASSISTANT",
      trackId: session.trackId,
      thread_id: session.threadId,
      parameters: {
        userMessage,
      },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`SHSAI sse/assist failed: ${response.status} - ${errorBody}`);
  }

  const text = await response.text();
  const chunks = text.split("\n").filter((line) => line.trim());
  let fullContent = "";

  for (const chunk of chunks) {
    try {
      const parsed = JSON.parse(chunk);
      if (parsed.type === "TEXT") {
        fullContent += parsed.content;
      }
      if (parsed.type === "STATUS" && parsed.content === "COMPLETE") {
        break;
      }
    } catch {
      // skip non-JSON lines
    }
  }

  return fullContent;
}

export async function queryServiceOrder(
  agentUserId: string,
  serviceOrder: string
): Promise<{ session: ShsaiSession; content: string }> {
  const session = await initSession(agentUserId);
  const prompt = `Give me all orders for customer having sample service order number ${serviceOrder}`;
  const content = await sseAssist(session, prompt);
  return { session, content };
}

export async function sendFollowup(
  session: ShsaiSession,
  message: string
): Promise<string> {
  return await sseAssist(session, message);
}
