## Implementation
100% vibes 🎶🎵🎶, at [Cafe Cursor @ Waterloo](https://luma.com/uwaterloo-1)
credits to [@minicube11](https://github.com/minicube11) for inspo

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
