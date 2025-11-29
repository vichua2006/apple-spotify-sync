/**
 * Apple Music playback state as detected from MusicKit
 */
export interface ApplePlaybackState {
  trackId: string | null;
  title: string | null;
  artist: string | null;
  album: string | null;
  durationSec: number | null; // seconds
  positionSec: number; // seconds
  playbackState: "playing" | "paused" | "stopped";
  hostTimestampMs: number; // Date.now() when this snapshot was taken
}

/**
 * WebSocket message types
 */
export type WsMessage =
  | { type: "JOIN"; sessionId: string; role: "host" | "listener"; listenerId?: string }
  | { type: "STATE_UPDATE"; sessionId: string; payload: ApplePlaybackState };

/**
 * Metadata for a WebSocket client connection
 */
export interface ClientMeta {
  socket: WebSocket;
  sessionId: string;
  role: "host" | "listener";
  listenerId?: string; // identifies the listener for Spotify tokens
}

/**
 * Spotify token information stored per listener
 */
export interface TokenInfo {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // timestamp in milliseconds
}

