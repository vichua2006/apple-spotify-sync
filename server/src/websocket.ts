import { WebSocketServer, WebSocket } from "ws";
import { Server as HttpServer } from "http";
import { ClientMeta, WsMessage, ApplePlaybackState } from "./types";

/**
 * WebSocket relay server for syncing Apple Music playback to Spotify
 */
export class WebSocketRelay {
  private wss: WebSocketServer;
  private sessions: Map<string, Set<ClientMeta>> = new Map();
  private lastHeartbeat: Map<WebSocket, number> = new Map();
  private heartbeatCheckInterval: NodeJS.Timeout | null = null;
  private readonly HEARTBEAT_TIMEOUT_MS = 60000; // 60 seconds

  constructor(server: HttpServer) {
    this.wss = new WebSocketServer({ server });

    // Check for stale connections every 30 seconds
    this.heartbeatCheckInterval = setInterval(() => {
      this.checkHeartbeats();
    }, 30000);

    this.wss.on("connection", (ws: WebSocket) => {
      console.log("New WebSocket connection");
      this.lastHeartbeat.set(ws, Date.now());

      let clientMeta: ClientMeta | null = null;

      ws.on("message", (data: Buffer) => {
        try {
          const message: WsMessage = JSON.parse(data.toString());

          if (message.type === "JOIN") {
            this.handleJoin(ws, message, (meta) => {
              clientMeta = meta;
            });
          } else if (message.type === "STATE_UPDATE") {
            this.handleStateUpdate(ws, message);
          } else if (message.type === "PING") {
            this.lastHeartbeat.set(ws, Date.now());
            ws.send(JSON.stringify({ type: "PONG" }));
          } else if (message.type === "PONG") {
            this.lastHeartbeat.set(ws, Date.now());
          } else {
            console.warn("Unknown message type:", message);
            ws.send(
              JSON.stringify({
                type: "ERROR",
                message: "Unknown message type",
              })
            );
          }
        } catch (error) {
          console.error("Error parsing WebSocket message:", error);
          ws.send(
            JSON.stringify({
              type: "ERROR",
              message: "Invalid JSON",
            })
          );
        }
      });

      ws.on("close", () => {
        console.log("WebSocket connection closed");
        this.lastHeartbeat.delete(ws);
        if (clientMeta) {
          this.removeClient(clientMeta);
        }
      });

      ws.on("error", (error) => {
        console.error("WebSocket error:", error);
        this.lastHeartbeat.delete(ws);
        if (clientMeta) {
          this.removeClient(clientMeta);
        }
      });
    });

    this.wss.on("close", () => {
      if (this.heartbeatCheckInterval) {
        clearInterval(this.heartbeatCheckInterval);
        this.heartbeatCheckInterval = null;
      }
    });
  }

  private checkHeartbeats(): void {
    const now = Date.now();
    const staleConnections: WebSocket[] = [];

    this.lastHeartbeat.forEach((lastTime, ws) => {
      if (now - lastTime > this.HEARTBEAT_TIMEOUT_MS) {
        staleConnections.push(ws);
      }
    });

    staleConnections.forEach((ws) => {
      console.log("Client heartbeat timeout, closing connection");
      this.lastHeartbeat.delete(ws);
      ws.terminate();
    });
  }

  private handleJoin(
    ws: WebSocket,
    message: { type: "JOIN"; sessionId: string; role: "host" | "listener"; listenerId?: string },
    onJoin: (meta: ClientMeta) => void
  ): void {
    // Validate message
    if (!message.sessionId || !message.role) {
      ws.send(
        JSON.stringify({
          type: "ERROR",
          message: "Invalid JOIN message: missing sessionId or role",
        })
      );
      return;
    }

    if (message.role !== "host" && message.role !== "listener") {
      ws.send(
        JSON.stringify({
          type: "ERROR",
          message: "Invalid role: must be 'host' or 'listener'",
        })
      );
      return;
    }

    // Create client metadata
    const clientMeta: ClientMeta = {
      socket: ws,
      sessionId: message.sessionId,
      role: message.role,
      listenerId: message.listenerId,
    };

    // Add to session
    if (!this.sessions.has(message.sessionId)) {
      this.sessions.set(message.sessionId, new Set());
    }
    this.sessions.get(message.sessionId)!.add(clientMeta);

    console.log(
      `Client joined session ${message.sessionId} as ${message.role}${message.listenerId ? ` (listenerId: ${message.listenerId})` : ""}`
    );

    // Confirm join
    ws.send(
      JSON.stringify({
        type: "JOINED",
        sessionId: message.sessionId,
        role: message.role,
      })
    );

    onJoin(clientMeta);
  }

  private handleStateUpdate(
    ws: WebSocket,
    message: { type: "STATE_UPDATE"; sessionId: string; payload: ApplePlaybackState }
  ): void {
    // Find the client sending this update
    const session = this.sessions.get(message.sessionId);
    if (!session) {
      ws.send(
        JSON.stringify({
          type: "ERROR",
          message: "Session not found. Send JOIN first.",
        })
      );
      return;
    }

    // Find the sender
    let sender: ClientMeta | null = null;
    for (const client of session) {
      if (client.socket === ws) {
        sender = client;
        break;
      }
    }

    if (!sender) {
      ws.send(
        JSON.stringify({
          type: "ERROR",
          message: "Client not found in session",
        })
      );
      return;
    }

    // Only hosts can send state updates
    if (sender.role !== "host") {
      ws.send(
        JSON.stringify({
          type: "ERROR",
          message: "Only hosts can send state updates",
        })
      );
      return;
    }

    // Validate payload
    if (!this.isValidPlaybackState(message.payload)) {
      ws.send(
        JSON.stringify({
          type: "ERROR",
          message: "Invalid playback state payload",
        })
      );
      return;
    }

    // Broadcast to all listeners in the session
    let broadcastCount = 0;
    for (const client of session) {
      if (client.role === "listener" && client.socket.readyState === WebSocket.OPEN) {
        client.socket.send(JSON.stringify(message));
        broadcastCount++;
      }
    }

    console.log(
      `State update broadcasted to ${broadcastCount} listener(s) in session ${message.sessionId}`
    );
  }

  private isValidPlaybackState(state: any): state is ApplePlaybackState {
    return (
      typeof state === "object" &&
      state !== null &&
      (state.trackId === null || typeof state.trackId === "string") &&
      (state.title === null || typeof state.title === "string") &&
      (state.artist === null || typeof state.artist === "string") &&
      (state.album === null || typeof state.album === "string") &&
      (state.durationSec === null || typeof state.durationSec === "number") &&
      typeof state.positionSec === "number" &&
      (state.playbackState === "playing" ||
        state.playbackState === "paused" ||
        state.playbackState === "stopped") &&
      typeof state.hostTimestampMs === "number"
    );
  }

  private removeClient(clientMeta: ClientMeta): void {
    const session = this.sessions.get(clientMeta.sessionId);
    if (session) {
      session.delete(clientMeta);
      if (session.size === 0) {
        this.sessions.delete(clientMeta.sessionId);
        console.log(`Session ${clientMeta.sessionId} closed (no clients)`);
      } else {
        console.log(
          `Client removed from session ${clientMeta.sessionId} (${session.size} remaining)`
        );
      }
    }
  }

  /**
   * Get active session count (for debugging/monitoring)
   */
  public getActiveSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Get client count for a specific session
   */
  public getSessionClientCount(sessionId: string): number {
    return this.sessions.get(sessionId)?.size ?? 0;
  }
}

