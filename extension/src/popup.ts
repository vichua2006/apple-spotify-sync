// Popup script for extension configuration

let BACKEND_URL = "http://localhost:3000";

interface Config {
  role: "host" | "listener" | null;
  sessionId: string | null;
  listenerId: string | null;
}

let currentConfig: Config = {
  role: null,
  sessionId: null,
  listenerId: null,
};

// Load current configuration
async function loadConfig() {
  try {
    const result = await chrome.storage.local.get(["role", "sessionId", "backendUrl"]);
    const syncResult = await chrome.storage.sync.get(["listenerId"]);

    currentConfig.role = result.role || null;
    currentConfig.sessionId = result.sessionId || null;
    currentConfig.listenerId = syncResult.listenerId || null;
    
    // Load custom backend URL if set
    if (result.backendUrl) {
      BACKEND_URL = result.backendUrl;
    }

    // Update UI
    updateUI();
  } catch (error) {
    console.error("Failed to load config:", error);
    showStatus("Failed to load configuration", "error");
  }
}

// Update UI with current config
async function updateUI() {
  // Update role buttons
  const hostBtn = document.getElementById("role-host") as HTMLButtonElement;
  const listenerBtn = document.getElementById("role-listener") as HTMLButtonElement;
  const roleInfo = document.getElementById("role-info") as HTMLDivElement;

  if (currentConfig.role === "host") {
    hostBtn.classList.add("active");
    listenerBtn.classList.remove("active");
    roleInfo.textContent = "Host: Detects Apple Music playback";
    document.getElementById("listener-section")!.style.display = "none";
  } else if (currentConfig.role === "listener") {
    listenerBtn.classList.add("active");
    hostBtn.classList.remove("active");
    roleInfo.textContent = "Listener: Syncs to Spotify";
    document.getElementById("listener-section")!.style.display = "block";
    await updateListenerId();
  } else {
    hostBtn.classList.remove("active");
    listenerBtn.classList.remove("active");
    roleInfo.textContent = "Select a role to start";
    document.getElementById("listener-section")!.style.display = "none";
  }

  // Update session ID input
  const sessionIdInput = document.getElementById("session-id") as HTMLInputElement;
  if (currentConfig.sessionId) {
    sessionIdInput.value = currentConfig.sessionId;
  }
  
  // Update backend URL input
  const backendUrlInput = document.getElementById("backend-url") as HTMLInputElement;
  const result = await chrome.storage.local.get(["backendUrl"]);
  if (result.backendUrl) {
    backendUrlInput.value = result.backendUrl;
    BACKEND_URL = result.backendUrl;
  }
}

// Update listener ID display
async function updateListenerId() {
  const listenerIdDisplay = document.getElementById("listener-id-display") as HTMLDivElement;
  
  if (currentConfig.listenerId) {
    listenerIdDisplay.textContent = currentConfig.listenerId;
  } else {
    // Generate a new one
    const uuid = generateUUID();
    await chrome.storage.sync.set({ listenerId: uuid });
    currentConfig.listenerId = uuid;
    listenerIdDisplay.textContent = uuid;
  }
}

// Generate UUID
function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Save configuration
async function saveConfig() {
  const sessionIdInput = document.getElementById("session-id") as HTMLInputElement;
  const backendUrlInput = document.getElementById("backend-url") as HTMLInputElement;
  const sessionId = sessionIdInput.value.trim();
  const backendUrl = backendUrlInput.value.trim();

  if (!currentConfig.role) {
    showStatus("Please select a role", "error");
    return;
  }

  if (!sessionId) {
    showStatus("Please enter a session ID", "error");
    return;
  }

  try {
    const configToSave: any = {
      role: currentConfig.role,
      sessionId: sessionId,
    };
    
    // Save backend URL if provided
    if (backendUrl) {
      configToSave.backendUrl = backendUrl;
      // Derive WebSocket URL from HTTP URL
      const wsUrl = backendUrl.replace(/^http/, "ws").replace(/^https/, "wss");
      configToSave.wsUrl = wsUrl;
      BACKEND_URL = backendUrl;
    } else {
      // Clear custom URLs to use defaults
      configToSave.backendUrl = null;
      configToSave.wsUrl = null;
    }

    await chrome.storage.local.set(configToSave);

    // If listener, ensure listenerId exists
    if (currentConfig.role === "listener") {
      if (!currentConfig.listenerId) {
        const uuid = generateUUID();
        await chrome.storage.sync.set({ listenerId: uuid });
        currentConfig.listenerId = uuid;
      }
    }

    currentConfig.sessionId = sessionId;
    showStatus("Configuration saved! Please reload the extension (chrome://extensions → click reload).", "success");
  } catch (error) {
    console.error("Failed to save config:", error);
    showStatus("Failed to save configuration", "error");
  }
}

// Show status message
function showStatus(message: string, type: "success" | "error" | "info" = "info") {
  const statusDiv = document.getElementById("status") as HTMLDivElement;
  statusDiv.className = `status ${type}`;
  statusDiv.textContent = message;
  statusDiv.style.display = "block";

  if (type === "success") {
    setTimeout(() => {
      statusDiv.style.display = "none";
    }, 3000);
  }
}

// Open Spotify auth page
function openSpotifyAuth() {
  if (!currentConfig.listenerId) {
    showStatus("Listener ID not found. Please save configuration first.", "error");
    return;
  }

  const authUrl = `${BACKEND_URL}/auth/spotify/login?listenerId=${currentConfig.listenerId}`;
  chrome.tabs.create({ url: authUrl });
}

// Event listeners
document.addEventListener("DOMContentLoaded", () => {
  loadConfig();

  // Role buttons
  document.getElementById("role-host")!.addEventListener("click", () => {
    currentConfig.role = "host";
    updateUI();
  });

  document.getElementById("role-listener")!.addEventListener("click", () => {
    currentConfig.role = "listener";
    updateUI();
  });

  // Save button
  document.getElementById("save-config")!.addEventListener("click", saveConfig);

  // Spotify auth button
  document.getElementById("auth-spotify")!.addEventListener("click", openSpotifyAuth);
});

