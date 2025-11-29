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
   - Add `http://localhost:3000/auth/spotify/callback` to Redirect URIs
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

### Setting Extension Role

The extension needs to know if it's running as a "host" (playing Apple Music) or "listener" (syncing to Spotify).

**Option 1: Using Chrome DevTools Console**

1. Open the extension's background page (chrome://extensions → Details → Service worker)
2. In the console, run:
```javascript
// For host
chrome.storage.local.set({ role: "host", sessionId: "my-session" });

// For listener
chrome.storage.local.set({ role: "listener", sessionId: "my-session" });
```

**Option 2: Programmatically**

You can set these values from any script with access to `chrome.storage.local`.

### Authenticating Spotify (Listener Only)

1. Get your `listenerId` from chrome.storage.sync (it's auto-generated)
2. Open in browser: `http://localhost:3000/auth/spotify/login?listenerId=YOUR_LISTENER_ID`
3. Authorize the app
4. You should see a success page

## Usage

1. **Host Setup**:
   - Set role to "host" and set a sessionId
   - Open [Apple Music Web](https://music.apple.com)
   - Start playing music

2. **Listener Setup**:
   - Set role to "listener" with the same sessionId as host
   - Authenticate with Spotify (see above)
   - Make sure Spotify is open on a device (desktop app, web player, etc.)
   - The extension will automatically sync playback

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

