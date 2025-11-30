import { ExtensionMessage } from "./types";

/**
 * Content script that runs in the isolated world
 * Bridges messages between page context (appleInject.js) and background script
 */

// Inject the page script into the page context
function injectPageScript() {
  try {
    // Inject script using src (CSP-compliant) instead of inline textContent
    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("appleInject.js");
    script.onload = () => {
      script.remove();
      console.log("[Apple Sync] Page script injected");
    };
    script.onerror = (error) => {
      console.error("[Apple Sync] Failed to inject page script:", error);
    };
    (document.head || document.documentElement).appendChild(script);
  } catch (error) {
    console.error("[Apple Sync] Failed to inject page script:", error);
  }
}

// Listen for messages from the injected page script
window.addEventListener("message", (event: MessageEvent) => {
  // Only accept messages from the same window and with our source
  if (event.source !== window) return;

  const data = event.data;
  if (!data || data.source !== "APPLE_SYNC") return;

  // Forward to background script
  const message: ExtensionMessage = {
    source: data.source,
    type: data.type,
    payload: data.payload,
  };

  chrome.runtime.sendMessage(message).catch((error) => {
    console.error("[Apple Sync] Failed to send message to background:", error);
  });
});

// Inject the script when content script loads
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", injectPageScript);
} else {
  injectPageScript();
}

