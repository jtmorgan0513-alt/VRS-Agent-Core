const SHSAI_BASE_URL = "https://ais.tellurideplatform.com/tell/api/hs/routing/v1";

function generateTrackId(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export interface ShsaiSession {
  trackId: string;
  sessionId: string;
  threadId: string;
}

export async function initSession(agentUserId: string): Promise<ShsaiSession> {
  const trackId = generateTrackId();

  const response = await fetch(`${SHSAI_BASE_URL}/init`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
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

  const data = await response.json();
  return {
    trackId,
    sessionId: response.headers.get("sessionid") || data.sessionId || "",
    threadId: data.thread_id || data.threadId || "",
  };
}

export async function sendPrompt(
  sessionId: string,
  trackId: string,
  threadId: string,
  promptText: string
): Promise<any> {
  const response = await fetch(`${SHSAI_BASE_URL}/prompt`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Sessionid: sessionId,
    },
    body: JSON.stringify({
      chat_bot_type: "HS_ROUTE_ASSISTANT",
      trackId,
      thread_id: threadId,
      parameters: {
        userMessage: promptText,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`SHSAI prompt failed: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

export async function fetchAssistResponse(
  sessionId: string,
  trackId: string,
  threadId: string
): Promise<string> {
  const response = await fetch(`${SHSAI_BASE_URL}/assist`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Sessionid: sessionId,
    },
    body: JSON.stringify({
      chat_bot_type: "HS_ROUTE_ASSISTANT",
      trackId,
      thread_id: threadId,
    }),
  });

  if (!response.ok) {
    throw new Error(`SHSAI assist failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  if (Array.isArray(data)) {
    const textContent = data
      .filter((chunk: any) => chunk.type === "TEXT")
      .map((chunk: any) => chunk.content)
      .join("");
    return textContent;
  }

  if (data && typeof data === "object" && data.content) {
    return typeof data.content === "string" ? data.content : JSON.stringify(data.content, null, 2);
  }

  return typeof data === "string" ? data : JSON.stringify(data, null, 2);
}

export async function queryServiceOrder(
  agentUserId: string,
  serviceOrder: string
): Promise<{ session: ShsaiSession; content: string }> {
  const session = await initSession(agentUserId);
  const prompt = `Give me all orders for customer having sample service order number ${serviceOrder}`;
  await sendPrompt(session.sessionId, session.trackId, session.threadId, prompt);
  const content = await fetchAssistResponse(session.sessionId, session.trackId, session.threadId);
  return { session, content };
}

export async function sendFollowup(
  sessionId: string,
  trackId: string,
  threadId: string,
  message: string
): Promise<string> {
  await sendPrompt(sessionId, trackId, threadId, message);
  const content = await fetchAssistResponse(sessionId, trackId, threadId);
  return content;
}
