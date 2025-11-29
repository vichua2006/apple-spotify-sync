import { Router, Request, Response } from "express";
import { SpotifyClient } from "./spotify";

export function createRoutes(spotifyClient: SpotifyClient): Router {
  const router = Router();

  /**
   * GET /auth/spotify/login?listenerId=XYZ
   * Redirects to Spotify OAuth authorization page
   */
  router.get("/auth/spotify/login", (req: Request, res: Response) => {
    const listenerId = req.query.listenerId as string;

    if (!listenerId) {
      return res.status(400).json({ error: "listenerId query parameter is required" });
    }

    const authUrl = spotifyClient.getAuthUrl(listenerId);
    res.redirect(authUrl);
  });

  /**
   * GET /auth/spotify/callback
   * Handles OAuth callback from Spotify
   */
  router.get("/auth/spotify/callback", async (req: Request, res: Response) => {
    const code = req.query.code as string;
    const state = req.query.state as string; // listenerId
    const error = req.query.error as string;

    if (error) {
      return res.status(400).send(`
        <html>
          <body>
            <h1>Authorization Failed</h1>
            <p>Error: ${error}</p>
            <p>You can close this tab.</p>
          </body>
        </html>
      `);
    }

    if (!code || !state) {
      return res.status(400).send(`
        <html>
          <body>
            <h1>Invalid Request</h1>
            <p>Missing code or state parameter.</p>
            <p>You can close this tab.</p>
          </body>
        </html>
      `);
    }

    try {
      await spotifyClient.handleCallback(code, state);
      res.send(`
        <html>
          <body>
            <h1>Success!</h1>
            <p>Spotify authentication successful. You can close this tab.</p>
            <p>Listener ID: ${state}</p>
          </body>
        </html>
      `);
    } catch (error: any) {
      console.error("OAuth callback error:", error);
      res.status(500).send(`
        <html>
          <body>
            <h1>Authentication Error</h1>
            <p>${error.message}</p>
            <p>You can close this tab.</p>
          </body>
        </html>
      `);
    }
  });

  /**
   * POST /api/spotify/play-track
   * Search for a track and start playback
   */
  router.post("/api/spotify/play-track", async (req: Request, res: Response) => {
    try {
      const { listenerId, trackTitle, artistName, positionMs, spotifyTrackId } = req.body;

      if (!listenerId) {
        return res.status(400).json({ error: "listenerId is required" });
      }

      if (!spotifyClient.hasTokens(listenerId)) {
        return res.status(401).json({
          error: "Not authenticated",
          message: "Please authenticate with Spotify first via /auth/spotify/login",
        });
      }

      let trackUri: string;

      if (spotifyTrackId) {
        // Use provided Spotify track ID
        trackUri = spotifyTrackId.startsWith("spotify:track:")
          ? spotifyTrackId
          : `spotify:track:${spotifyTrackId}`;
      } else if (trackTitle && artistName) {
        // Search for track
        trackUri = await spotifyClient.searchTrack(trackTitle, artistName);
        if (!trackUri) {
          return res.status(404).json({
            error: "Track not found",
            message: `Could not find "${trackTitle}" by ${artistName} on Spotify`,
          });
        }
      } else {
        return res.status(400).json({
          error: "Missing track information",
          message: "Either spotifyTrackId or both trackTitle and artistName are required",
        });
      }

      const position = positionMs || 0;
      await spotifyClient.playTrack(listenerId, trackUri, position);

      res.json({
        success: true,
        trackUri,
        positionMs: position,
      });
    } catch (error: any) {
      console.error("Error playing track:", error);
      const statusCode = error.message.includes("Premium") ? 403 : error.message.includes("device") ? 404 : 500;
      res.status(statusCode).json({
        error: "Failed to play track",
        message: error.message,
      });
    }
  });

  /**
   * POST /api/spotify/pause
   * Pause playback
   */
  router.post("/api/spotify/pause", async (req: Request, res: Response) => {
    try {
      const { listenerId } = req.body;

      if (!listenerId) {
        return res.status(400).json({ error: "listenerId is required" });
      }

      if (!spotifyClient.hasTokens(listenerId)) {
        return res.status(401).json({
          error: "Not authenticated",
          message: "Please authenticate with Spotify first via /auth/spotify/login",
        });
      }

      await spotifyClient.pausePlayback(listenerId);

      res.json({ success: true });
    } catch (error: any) {
      console.error("Error pausing playback:", error);
      const statusCode = error.message.includes("Premium") ? 403 : error.message.includes("device") ? 404 : 500;
      res.status(statusCode).json({
        error: "Failed to pause playback",
        message: error.message,
      });
    }
  });

  /**
   * POST /api/spotify/seek
   * Seek to a specific position
   */
  router.post("/api/spotify/seek", async (req: Request, res: Response) => {
    try {
      const { listenerId, positionMs } = req.body;

      if (!listenerId) {
        return res.status(400).json({ error: "listenerId is required" });
      }

      if (typeof positionMs !== "number") {
        return res.status(400).json({ error: "positionMs must be a number" });
      }

      if (!spotifyClient.hasTokens(listenerId)) {
        return res.status(401).json({
          error: "Not authenticated",
          message: "Please authenticate with Spotify first via /auth/spotify/login",
        });
      }

      await spotifyClient.seekToPosition(listenerId, positionMs);

      res.json({ success: true, positionMs });
    } catch (error: any) {
      console.error("Error seeking:", error);
      const statusCode = error.message.includes("Premium") ? 403 : error.message.includes("device") ? 404 : 500;
      res.status(statusCode).json({
        error: "Failed to seek",
        message: error.message,
      });
    }
  });

  /**
   * GET /health
   * Health check endpoint
   */
  router.get("/health", (req: Request, res: Response) => {
    res.json({ status: "ok" });
  });

  return router;
}

