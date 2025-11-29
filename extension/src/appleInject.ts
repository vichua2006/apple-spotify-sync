import { ApplePlaybackState, MusicKitInstance } from "./types";

/**
 * This script runs in the page context (not isolated world)
 * It can access window.MusicKit directly
 */

function mapPlaybackState(state: number): "playing" | "paused" | "stopped" {
  // MusicKit playbackState: 0 = none, 1 = loading, 2 = playing, 3 = paused, 4 = stopped
  switch (state) {
    case 2:
      return "playing";
    case 3:
      return "paused";
    case 4:
      return "stopped";
    default:
      return "stopped";
  }
}

function extractPlaybackState(music: MusicKitInstance): ApplePlaybackState | null {
  const nowPlayingItem = music.nowPlayingItem;

  if (!nowPlayingItem) {
    // No track playing
    return {
      trackId: null,
      title: null,
      artist: null,
      album: null,
      durationSec: null,
      positionSec: music.currentPlaybackTime || 0,
      playbackState: mapPlaybackState(music.playbackState),
      hostTimestampMs: Date.now(),
    };
  }

  return {
    trackId: nowPlayingItem.id || null,
    title: nowPlayingItem.title || null,
    artist: nowPlayingItem.artistName || null,
    album: nowPlayingItem.albumName || null,
    durationSec: nowPlayingItem.duration ? nowPlayingItem.duration / 1000 : null,
    positionSec: music.currentPlaybackTime || 0,
    playbackState: mapPlaybackState(music.playbackState),
    hostTimestampMs: Date.now(),
  };
}

function postState(state: ApplePlaybackState) {
  window.postMessage(
    {
      source: "APPLE_SYNC",
      type: "APPLE_STATE",
      payload: state,
    },
    "*"
  );
}

async function waitForMusicKit(): Promise<MusicKitInstance> {
  const maxAttempts = 50; // 10 seconds total (200ms * 50)
  let attempts = 0;

  while (attempts < maxAttempts) {
    if (window.MusicKit && window.MusicKit.getInstance()) {
      const music = window.MusicKit.getInstance();
      if (music) {
        return music;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
    attempts++;
  }

  throw new Error("MusicKit not available after waiting");
}

async function init() {
  try {
    const music = await waitForMusicKit();
    console.log("[Apple Sync] MusicKit detected, starting playback monitoring");

    let lastState: ApplePlaybackState | null = null;

    function sendStateIfChanged() {
      const state = extractPlaybackState(music);
      if (!state) return;

      // Only send if state changed (to avoid spam)
      if (
        !lastState ||
        lastState.trackId !== state.trackId ||
        lastState.playbackState !== state.playbackState ||
        Math.abs(lastState.positionSec - state.positionSec) > 0.5 // More than 0.5s difference
      ) {
        postState(state);
        lastState = state;
      }
    }

    // Subscribe to MusicKit events
    music.addEventListener("playbackStateDidChange", sendStateIfChanged);
    music.addEventListener("mediaItemDidChange", sendStateIfChanged);
    music.addEventListener("playbackTimeDidChange", sendStateIfChanged);

    // Also poll periodically to catch time changes (every 500ms)
    const pollInterval = setInterval(() => {
      if (music) {
        sendStateIfChanged();
      } else {
        clearInterval(pollInterval);
      }
    }, 500);

    // Send initial state
    sendStateIfChanged();

    console.log("[Apple Sync] Playback monitoring active");
  } catch (error) {
    console.error("[Apple Sync] Failed to initialize:", error);
  }
}

// Run when script loads
init();

