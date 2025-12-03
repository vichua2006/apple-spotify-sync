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

    console.log("[OAuth Callback] Received callback request:");
    console.log("  Query params:", JSON.stringify(req.query, null, 2));
    console.log("  Code:", code ? "present" : "missing");
    console.log("  State (listenerId):", state || "missing");
    console.log("  Error:", error || "none");

    if (error) {
      console.error("[OAuth Callback] Spotify returned an error:", error);
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
      console.error("[OAuth Callback] Missing required parameters - code:", !!code, "state:", !!state);
      return res.status(400).send(`
        <html>
          <body>
            <h1>Invalid Request</h1>
            <p>Missing code or state parameter.</p>
            <p>Code: ${code ? "present" : "missing"}</p>
            <p>State: ${state ? "present" : "missing"}</p>
            <p>You can close this tab.</p>
          </body>
        </html>
      `);
    }

    try {
      console.log("[OAuth Callback] Processing callback for listenerId:", state);
      await spotifyClient.handleCallback(code, state);
      console.log("[OAuth Callback] Successfully authenticated listenerId:", state);
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
      console.error("[OAuth Callback] Error processing callback:");
      console.error("  Error type:", error.constructor.name);
      console.error("  Error message:", error.message);
      console.error("  Error stack:", error.stack);
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

      let trackUri: string | null = null;

      if (spotifyTrackId) {
        // Use provided Spotify track ID
        trackUri = spotifyTrackId.startsWith("spotify:track:")
          ? spotifyTrackId
          : `spotify:track:${spotifyTrackId}`;
      } else if (trackTitle) {
        // Search for track by name only (uses top-rated result)
        trackUri = await spotifyClient.searchTrack(listenerId, trackTitle);
        if (!trackUri) {
          return res.status(404).json({
            error: "Track not found",
            message: `Could not find "${trackTitle}" on Spotify`,
          });
        }
      } else {
        return res.status(400).json({
          error: "Missing track information",
          message: "Either spotifyTrackId or trackTitle is required",
        });
      }

      // At this point, trackUri must be a string (not null)
      if (!trackUri) {
        return res.status(400).json({
          error: "Invalid track URI",
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

