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
  | { type: "STATE_UPDATE"; sessionId: string; payload: ApplePlaybackState }
  | { type: "JOINED"; sessionId: string; role: "host" | "listener" }
  | { type: "ERROR"; message: string };

/**
 * Extension message types for chrome.runtime communication
 */
export interface ExtensionMessage {
  source: "APPLE_SYNC";
  type: "APPLE_STATE";
  payload: ApplePlaybackState;
}

/**
 * MusicKit types (for type safety when accessing window.MusicKit)
 */
export interface MusicKitInstance {
  nowPlayingItem: {
    id: string;
    title: string;
    artistName: string;
    albumName: string;
    duration: number; // milliseconds
  } | null;
  currentPlaybackTime: number; // seconds
  currentPlaybackDuration: number; // seconds
  playbackState: number; // 0 = none, 1 = loading, 2 = playing, 3 = paused, 4 = stopped
  addEventListener(event: string, callback: () => void): void;
  removeEventListener(event: string, callback: () => void): void;
}

declare global {
  interface Window {
    MusicKit?: {
      getInstance(): MusicKitInstance | null;
    };
  }
}

