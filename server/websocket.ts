import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import jwt from "jsonwebtoken";
import { storage } from "./storage";
import { log } from "./index";

interface ConnectedClient {
  ws: WebSocket;
  userId: number;
  name: string;
  role: string;
  divisions: string[];
  agentStatus: string;
}

interface WSEvent {
  type: string;
  payload: Record<string, any>;
}

const clients = new Map<number, ConnectedClient>();

const WARRANTY_LABELS: Record<string, string> = {
  sears_protect: "SPHW",
  sears_pa: "Sears PA",
  legacy_sears_cinch: "Cinch",
  ahs: "American Home Shield",
  first_american: "First American",
};

const DIVISION_LABELS: Record<string, string> = {
  refrigeration: "Refrigeration",
  laundry: "Laundry",
  cooking: "Cooking",
  dishwasher: "Dishwasher / Compactor",
  microwave: "Microwave",
  hvac: "HVAC",
  all_other: "All Other",
};

export function getWarrantyLabel(warrantyKey: string): string {
  return WARRANTY_LABELS[warrantyKey] || warrantyKey;
}

export function getDivisionLabel(divisionKey: string): string {
  return DIVISION_LABELS[divisionKey] || divisionKey;
}

export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", async (ws, req) => {
    const url = new URL(req.url || "", `http://${req.headers.host}`);
    const token = url.searchParams.get("token");

    if (!token) {
      ws.close(4001, "No token provided");
      return;
    }

    try {
      const secret = process.env.SESSION_SECRET!;
      const decoded = jwt.verify(token, secret) as {
        id: number;
        name: string;
        role: string;
      };

      const user = await storage.getUser(decoded.id);
      if (!user || !user.isActive) {
        ws.close(4002, "User not found or inactive");
        return;
      }

      const existingClient = clients.get(decoded.id);
      if (existingClient) {
        try { existingClient.ws.close(4000, "Replaced by new connection"); } catch {}
      }

      let divisions: string[] = [];
      if (user.role === "admin" || user.role === "super_admin") {
        divisions = Object.keys(DIVISION_LABELS);
      } else if (user.role === "vrs_agent") {
        const specs = await storage.getSpecializations(decoded.id);
        divisions = specs.map(s => s.division);
      }

      const client: ConnectedClient = {
        ws,
        userId: decoded.id,
        name: user.name || decoded.name,
        role: user.role,
        divisions,
        agentStatus: (user as any).agentStatus || "offline",
      };

      clients.set(decoded.id, client);
      log(`WebSocket connected: ${client.name} (${client.role}, id=${client.userId})`, "ws");

      ws.on("close", async () => {
        const current = clients.get(decoded.id);
        if (current && current.ws === ws) {
          clients.delete(decoded.id);
          log(`WebSocket disconnected: ${client.name} (id=${client.userId})`, "ws");

          if (client.role === "vrs_agent" && client.agentStatus !== "offline") {
            try {
              await storage.updateUser(client.userId, { agentStatus: "offline", updatedAt: new Date() } as any);
              broadcastToAdmins({
                type: "agent_status_changed",
                payload: { userId: client.userId, name: client.name, status: "offline" },
              });
              log(`Agent ${client.name} auto-set offline on disconnect`, "ws");
              broadcastToTechnicians({
                type: 'vrs_availability',
                payload: { onlineAgents: getOnlineAgentCount() }
              });
            } catch (err) {
              log(`Failed to auto-offline agent ${client.name}: ${err}`, "ws");
            }
          }
        }
      });

      ws.on("error", () => {
        const current = clients.get(decoded.id);
        if (current && current.ws === ws) {
          clients.delete(decoded.id);
        }
      });

      sendToClient(ws, { type: "connected", payload: { userId: decoded.id } });

      if (client.role === 'technician') {
        try {
          const onlineAgents = getOnlineAgentCount();
          const queuedTickets = await storage.getQueuedCountAll();
          sendToClient(ws, {
            type: 'vrs_availability',
            payload: { onlineAgents, queuedTickets }
          });
        } catch (e) {
          sendToClient(ws, {
            type: 'vrs_availability',
            payload: { onlineAgents: getOnlineAgentCount(), queuedTickets: 0 }
          });
        }
      }

    } catch (err) {
      ws.close(4003, "Invalid token");
    }
  });

  log("WebSocket server initialized on /ws", "ws");
}

function sendToClient(ws: WebSocket, event: WSEvent) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(event));
  }
}

export function broadcastToAgent(userId: number, event: WSEvent) {
  const client = clients.get(userId);
  if (client) {
    sendToClient(client.ws, event);
  }
}

export function broadcastToDivisionAgents(division: string, event: WSEvent, excludeUserId?: number) {
  for (const [userId, client] of clients) {
    if (excludeUserId && userId === excludeUserId) continue;
    if (client.role !== "vrs_agent") continue;
    if (client.agentStatus !== "online") continue;

    const isGeneralist = client.divisions.includes("generalist") ||
      client.divisions.length >= Object.keys(DIVISION_LABELS).length;
    if (isGeneralist || client.divisions.includes(division)) {
      sendToClient(client.ws, event);
    }
  }
}

export function broadcastToAdmins(event: WSEvent) {
  for (const [, client] of clients) {
    if (client.role === "admin" || client.role === "super_admin") {
      sendToClient(client.ws, event);
    }
  }
}

export function broadcastToAllAgents(event: WSEvent, excludeUserId?: number) {
  for (const [userId, client] of clients) {
    if (excludeUserId && userId === excludeUserId) continue;
    if (client.role === "vrs_agent") {
      sendToClient(client.ws, event);
    }
  }
}

export function updateClientStatus(userId: number, status: string) {
  const client = clients.get(userId);
  if (client) {
    client.agentStatus = status;
  }
}

export function updateClientDivisions(userId: number, divisions: string[]) {
  const client = clients.get(userId);
  if (client) {
    client.divisions = divisions;
  }
}

export function getConnectedClient(userId: number): ConnectedClient | undefined {
  return clients.get(userId);
}

export function isAgentConnectedAndOnline(userId: number): boolean {
  const client = clients.get(userId);
  return !!client && client.agentStatus === "online";
}

export function getOnlineAgentCount(): number {
  let count = 0;
  for (const [, client] of clients) {
    if (client.role === 'vrs_agent' && client.agentStatus === 'online') {
      count++;
    }
  }
  return count;
}

export function broadcastToTechnicians(event: WSEvent) {
  for (const [, client] of clients) {
    if (client.role === 'technician') {
      sendToClient(client.ws, event);
    }
  }
}
