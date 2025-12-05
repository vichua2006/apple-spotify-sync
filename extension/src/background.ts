import { ExtensionMessage, WsMessage, ApplePlaybackState } from "./types";

// Configuration - can be overridden via chrome.storage.local
let WS_URL = "ws://localhost:3000";
let BACKEND_URL = "http://localhost:3000";

// WebSocket connection
let ws: WebSocket | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const INITIAL_RECONNECT_DELAY = 1000; // 1 second
let shouldAutoReconnect = true; // Control auto-reconnect behavior
let reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null; // Store timeout ID to cancel if needed
let heartbeatIntervalId: ReturnType<typeof setInterval> | null = null;
const HEARTBEAT_INTERVAL_MS = 30000; // Send heartbeat every 30 seconds

// Session configuration
let sessionId: string | null = null;
let role: "host" | "listener" | null = null;
let listenerId: string | null = null;

// Listener sync state
let lastAppliedTrackId: string | null = null;
let lastAppliedPositionMs: number = 0;
let lastAppliedHostTimestampMs: number = 0;
let lastSyncCallTime: number = 0;
let lastSeekTime: number = 0;
const SYNC_THROTTLE_MS = 200; // Max sync calls every 200ms
const SEEK_THROTTLE_MS = 1000; // Max seek calls every 1 second
const DRIFT_THRESHOLD_MS = 3750; // Seek if drift > 750ms

/**
 * Generate a UUID for listenerId
 */
function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Load configuration from chrome.storage
 */
async function loadConfig(): Promise<void> {
  try {
    const result = await chrome.storage.local.get(["sessionId", "role", "wsUrl", "backendUrl"]);
    sessionId = result.sessionId || "default-session";
    role = result.role || "host";
    
    // Load custom URLs if set, otherwise use defaults
    if (result.wsUrl) {
      WS_URL = result.wsUrl;
    }
    if (result.backendUrl) {
      BACKEND_URL = result.backendUrl;
    }

    // Generate and persist listenerId if listener
    if (role === "listener") {
      const syncResult = await chrome.storage.sync.get(["listenerId"]);
      if (syncResult.listenerId) {
        listenerId = syncResult.listenerId;
      } else {
        listenerId = generateUUID();
        await chrome.storage.sync.set({ listenerId });
        console.log("[Background] Generated listenerId:", listenerId);
      }
    }

    console.log("[Background] Config loaded:", { sessionId, role, listenerId, WS_URL, BACKEND_URL });
  } catch (error) {
    console.error("[Background] Failed to load config:", error);
    // Use defaults
    sessionId = "default-session";
    role = "host";
  }
}

/**
 * Connect to WebSocket server
 */
async function connectWebSocket(): Promise<void> {
  // Check if auto-reconnect is disabled before attempting connection
  if (!shouldAutoReconnect) {
    console.log("[Background] Auto-reconnect disabled, not connecting");
    return;
  }

  if (ws && ws.readyState === WebSocket.OPEN) {
    return; // Already connected
  }

  // Reload URLs from storage in case they changed
  const result = await chrome.storage.local.get(["wsUrl", "backendUrl"]);
  if (result.wsUrl) {
    WS_URL = result.wsUrl;
  }
  if (result.backendUrl) {
    BACKEND_URL = result.backendUrl;
  }

  console.log("[Background] Connecting to WebSocket:", WS_URL);
  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    console.log("[Background] WebSocket connected");
    reconnectAttempts = 0;

    // Send JOIN message
    if (sessionId && role && ws) {
      const joinMessage: WsMessage = {
        type: "JOIN",
        sessionId,
        role,
        listenerId: role === "listener" ? listenerId || undefined : undefined,
      };
      ws.send(JSON.stringify(joinMessage));
      console.log("[Background] Sent JOIN message:", joinMessage);
    }

    // Start heartbeat
    if (heartbeatIntervalId) {
      clearInterval(heartbeatIntervalId);
    }
    heartbeatIntervalId = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "PING" }));
      }
    }, HEARTBEAT_INTERVAL_MS);
  };

  ws.onmessage = (event) => {
    try {
      const message: WsMessage = JSON.parse(event.data);

      if (message.type === "JOINED") {
        console.log("[Background] Joined session:", message.sessionId);
      } else if (message.type === "STATE_UPDATE") {
        if (role === "listener") {
          handleHostStateUpdate(message.payload);
        }
      } else if (message.type === "PONG") {
        // Heartbeat response received
      } else if (message.type === "ERROR") {
        console.error("[Background] WebSocket error:", message.message);
      }
    } catch (error) {
      console.error("[Background] Failed to parse WebSocket message:", error);
    }
  };

  ws.onerror = (error) => {
    console.error("[Background] WebSocket error:", error);
  };

  ws.onclose = () => {
    console.log("[Background] WebSocket closed");
    ws = null;

    // Stop heartbeat
    if (heartbeatIntervalId) {
      clearInterval(heartbeatIntervalId);
      heartbeatIntervalId = null;
    }

    // Attempt reconnect with exponential backoff (only if auto-reconnect is enabled)
    if (shouldAutoReconnect && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      const delay = INITIAL_RECONNECT_DELAY * Math.pow(2, reconnectAttempts);
      reconnectAttempts++;
      console.log(`[Background] Reconnecting in ${delay}ms (attempt ${reconnectAttempts})`);
      // Store timeout ID so we can cancel it if disconnect is called
      reconnectTimeoutId = setTimeout(() => {
        reconnectTimeoutId = null; // Clear the ID when timeout fires
        connectWebSocket();
      }, delay);
    } else if (!shouldAutoReconnect) {
      console.log("[Background] Auto-reconnect disabled, connection stopped");
    } else {
      console.error("[Background] Max reconnection attempts reached");
    }
  };
}

/**
 * Handle incoming Apple Music state from content script (Host role)
 */
function handleAppleState(payload: ApplePlaybackState): void {
  if (role !== "host" || !ws || ws.readyState !== WebSocket.OPEN) {
    return;
  }

  if (!sessionId) {
    console.warn("[Background] No sessionId, cannot send state update");
    return;
  }

  const stateUpdate: WsMessage = {
    type: "STATE_UPDATE",
    sessionId,
    payload,
  };

  ws.send(JSON.stringify(stateUpdate));
}

/**
 * Handle host state update (Listener role)
 */
function handleHostStateUpdate(hostState: ApplePlaybackState): void {
  if (role !== "listener") {
    return;
  }

  const now = Date.now();

  // Throttle sync calls
  if (now - lastSyncCallTime < SYNC_THROTTLE_MS) {
    return;
  }
  lastSyncCallTime = now;

  // Ignore if no track playing
  if (!hostState.trackId) {
    return;
  }

  // Compute estimated host position accounting for drift
  const dt = now - hostState.hostTimestampMs; // ms since host snapshot
  const estimatedHostPosMs =
    hostState.playbackState === "playing"
      ? hostState.positionSec * 1000 + dt
      : hostState.positionSec * 1000;

  // Track changed
  if (hostState.trackId !== lastAppliedTrackId) {
    console.log("[Background] Track changed:", hostState.title, "by", hostState.artist);
    playTrack(hostState, estimatedHostPosMs);
    lastAppliedTrackId = hostState.trackId;
    lastAppliedPositionMs = estimatedHostPosMs;
    lastAppliedHostTimestampMs = hostState.hostTimestampMs;
    return;
  }

  // Same track - handle play/pause and seek
  if (hostState.playbackState === "paused") {
    // Host is paused - pause if we're playing
    pausePlayback();
  } else if (hostState.playbackState === "playing") {
    // Host is playing - check if we need to seek
    const drift = Math.abs(lastAppliedPositionMs - estimatedHostPosMs);
    const timeSinceLastSeek = now - lastSeekTime;

    if (drift > DRIFT_THRESHOLD_MS && timeSinceLastSeek >= SEEK_THROTTLE_MS) {
      console.log(`[Background] Seeking to ${estimatedHostPosMs}ms (drift: ${drift}ms)`);
      seekToPosition(estimatedHostPosMs);
      lastAppliedPositionMs = estimatedHostPosMs;
      lastAppliedHostTimestampMs = hostState.hostTimestampMs;
      lastSeekTime = now;
    }
  }
}

/**
 * Call backend API to play a track
 */
async function playTrack(state: ApplePlaybackState, positionMs: number): Promise<void> {
  if (!listenerId || !state.title || !state.artist) {
    console.error("[Background] Missing required info for playTrack");
    return;
  }

  try {
    const response = await fetch(`${BACKEND_URL}/api/spotify/play-track`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        listenerId,
        trackTitle: state.title,
        artistName: state.artist,
        positionMs: Math.max(0, positionMs),
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error("[Background] Failed to play track:", error);
      return;
    }

    console.log("[Background] Track playing:", state.title);
  } catch (error) {
    console.error("[Background] Error calling play-track API:", error);
  }
}

/**
 * Call backend API to pause playback
 */
async function pausePlayback(): Promise<void> {
  if (!listenerId) {
    return;
  }

  try {
    const response = await fetch(`${BACKEND_URL}/api/spotify/pause`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ listenerId }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error("[Background] Failed to pause:", error);
      return;
    }

    console.log("[Background] Playback paused");
  } catch (error) {
    console.error("[Background] Error calling pause API:", error);
  }
}

/**
 * Call backend API to seek to position
 */
async function seekToPosition(positionMs: number): Promise<void> {
  if (!listenerId) {
    return;
  }

  try {
    const response = await fetch(`${BACKEND_URL}/api/spotify/seek`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        listenerId,
        positionMs: Math.max(0, positionMs),
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error("[Background] Failed to seek:", error);
      return;
    }
  } catch (error) {
    console.error("[Background] Error calling seek API:", error);
  }
}

/**
 * Stop WebSocket connection
 */
function disconnectWebSocket(): void {
  shouldAutoReconnect = false;
  
  // Cancel any pending reconnect timeout
  if (reconnectTimeoutId !== null) {
    clearTimeout(reconnectTimeoutId);
    reconnectTimeoutId = null;
    console.log("[Background] Cancelled pending reconnect");
  }

  // Stop heartbeat
  if (heartbeatIntervalId) {
    clearInterval(heartbeatIntervalId);
    heartbeatIntervalId = null;
  }
  
  if (ws) {
    ws.close();
    ws = null;
  }
  console.log("[Background] WebSocket connection stopped");
}

/**
 * Start WebSocket connection
 */
async function startConnection(): Promise<void> {
  // Cancel any pending reconnect timeout before starting fresh
  if (reconnectTimeoutId !== null) {
    clearTimeout(reconnectTimeoutId);
    reconnectTimeoutId = null;
  }
  
  shouldAutoReconnect = true;
  reconnectAttempts = 0;
  await connectWebSocket();
}

/**
 * Listen for messages from content script and popup
 */
chrome.runtime.onMessage.addListener(
  (message: any, sender, sendResponse) => {
    if (message.source === "APPLE_SYNC" && message.type === "APPLE_STATE") {
      handleAppleState(message.payload);
    } else if (message.type === "CONNECTION_CONTROL") {
      if (message.action === "start") {
        startConnection().then(() => {
          sendResponse({ success: true, status: "connected" });
        }).catch((error) => {
          sendResponse({ success: false, error: error.message });
        });
        return true; // Keep channel open for async response
      } else if (message.action === "stop") {
        disconnectWebSocket();
        sendResponse({ success: true, status: "disconnected" });
      } else if (message.action === "status") {
        const isConnected = ws !== null && ws.readyState === WebSocket.OPEN;
        sendResponse({ success: true, connected: isConnected });
      }
    }
    return true; // Keep channel open for async response
  }
);

/**
 * Initialize extension
 */
async function init() {
  await loadConfig();
  // Don't auto-connect on startup - user must click "Start Connection"
  console.log("[Background] Extension initialized. Use popup to start connection.");
}

// Initialize on service worker startup
init();

