import { ExtensionMessage } from "./types";

/**
 * Content script that runs in the isolated world
 * Bridges messages between page context (appleInject.js) and background script
 */

// Inject the page script into the page context
async function injectPageScript() {
  try {
    // Fetch the script file and inject it into the page context
    const response = await fetch(chrome.runtime.getURL("appleInject.js"));
    const code = await response.text();

    // Inject into page context (not isolated world)
    const script = document.createElement("script");
    script.textContent = code;
    (document.head || document.documentElement).appendChild(script);
    script.remove();

    console.log("[Apple Sync] Page script injected");
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

