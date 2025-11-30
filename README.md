# Apple Music to Spotify Sync

A Chrome extension and backend server that syncs Apple Music playback to Spotify in real-time.

## Architecture

- **Chrome Extension (MV3)**: Detects Apple Music playback and syncs to Spotify
- **WebSocket Relay Server**: Broadcasts playback state from host to listeners
- **Spotify Backend API**: Handles OAuth and controls Spotify playback

## Setup

### Backend Server

1. Navigate to the server directory:
```bash
cd server
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file (copy from `.env.example`):
```bash
SPOTIFY_CLIENT_ID=your_spotify_client_id_here
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret_here
SPOTIFY_REDIRECT_URI=http://localhost:3000/auth/spotify/callback
PORT=3000
```

4. Get Spotify API credentials:
   - Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
   - Create a new app
   - **Important**: Spotify doesn't allow `localhost` redirect URIs
   - use ngrok to get a public URL for the redirect URI
   - Copy Client ID and Client Secret to `.env`

5. Start the server:
```bash
npm run dev
```

### Chrome Extension

1. Navigate to the extension directory:
```bash
cd extension
```

2. Install dependencies:
```bash
npm install
```

3. Build the extension:
```bash
npm run build
```

4. Load the extension in Chrome:
   - Open `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `extension/` directory

## Configuration

### Using the Popup UI (Recommended)

1. Click the extension icon in Chrome's toolbar
2. Select your role (Host or Listener)
3. Enter a Session ID (same ID for both host and listener)
4. If you're a listener, click "Authenticate Spotify" to connect your account
5. Click "Save Configuration"

The extension will automatically reload with your new settings.

### Manual Configuration (Alternative)

**Using Chrome DevTools Console:**

1. Open the extension's background page (chrome://extensions → Details → Service worker)
2. In the console, run:
```javascript
// For host
chrome.storage.local.set({ role: "host", sessionId: "my-session" });

// For listener
chrome.storage.local.set({ role: "listener", sessionId: "my-session" });
```

### Authenticating Spotify (Listener Only)

If using the popup UI, click "Authenticate Spotify" button. Otherwise:

1. Get your `listenerId` from chrome.storage.sync (it's auto-generated)
2. Open in browser: `http://localhost:3000/auth/spotify/login?listenerId=YOUR_LISTENER_ID`
3. Authorize the app
4. You should see a success page

## Usage

1. **Host Setup**:
   - Set role to "host" and set a sessionId (use the popup UI)
   - Open [Apple Music Web](https://music.apple.com)
   - Start playing music

2. **Listener Setup**:
   - Set role to "listener" with the same sessionId as host
   - Authenticate with Spotify (click "Authenticate Spotify" in popup)
   - Make sure Spotify is open on a device (desktop app, web player, etc.)
   - The extension will automatically sync playback

## Testing on a Single Computer

You can test the entire system on one computer using one of these methods:

### Method 1: Two Chrome Profiles (Recommended)

1. Create a second Chrome profile:
   - Click your profile icon in Chrome → "Add"
   - Create a new profile

2. Load the extension in both profiles:
   - In Profile 1: Set role to "host", sessionId: "test-123"
   - In Profile 2: Set role to "listener", sessionId: "test-123"

3. Test:
   - Profile 1: Open Apple Music and play music
   - Profile 2: Open Spotify and watch it sync

### Method 2: Chrome + Chrome Canary (or Edge)

1. Install Chrome Canary (or use Microsoft Edge)
2. Load the extension in both browsers
3. Configure one as host, one as listener (same sessionId)
4. Test as above

### Method 3: Quick Role Switching (For Development)

1. Use the popup UI to quickly switch between host/listener roles
2. You'll need to manually switch roles and reload when testing
3. Note: This is less ideal since you can't be both at once, but useful for quick testing

## Development

### Backend

- Development: `npm run dev` (uses ts-node)
- Build: `npm run build`
- Production: `npm start`

### Extension

- Build: `npm run build`
- Watch mode: `npm run watch`

## Project Structure

```
apple-spotify-sync/
├── server/              # Backend server
│   ├── src/
│   │   ├── index.ts     # Main server entry
│   │   ├── websocket.ts # WebSocket relay
│   │   ├── spotify.ts   # Spotify API client
│   │   ├── routes.ts    # HTTP endpoints
│   │   └── types.ts     # TypeScript types
│   └── package.json
├── extension/           # Chrome extension
│   ├── src/
│   │   ├── background.ts    # Service worker
│   │   ├── appleContent.ts  # Content script
│   │   ├── appleInject.ts   # Page script (injected)
│   │   └── types.ts         # TypeScript types
│   ├── manifest.json
│   └── package.json
└── README.md
```

## API Endpoints

- `GET /auth/spotify/login?listenerId=XYZ` - Start Spotify OAuth
- `GET /auth/spotify/callback` - OAuth callback
- `POST /api/spotify/play-track` - Play a track
- `POST /api/spotify/pause` - Pause playback
- `POST /api/spotify/seek` - Seek to position
- `GET /health` - Health check

## Notes

- Requires Spotify Premium for playback control
- Tokens are stored in-memory (lost on server restart)
- WebSocket URL is hardcoded to `ws://localhost:3000` (can be changed in `background.ts`)
- Session IDs are simple strings (no validation)

## Troubleshooting

- **Extension not connecting**: Check that the backend server is running
- **Spotify not playing**: Ensure you have Premium and a device is active
- **No sync happening**: Verify both host and listener have the same sessionId
- **MusicKit not detected**: Make sure you're on music.apple.com and music is playing

