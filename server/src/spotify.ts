import axios, { AxiosInstance } from "axios";
import { TokenInfo } from "./types";

/**
 * Spotify API client and OAuth handler
 */
export class SpotifyClient {
  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;
  private tokenStore: Map<string, TokenInfo> = new Map();
  private apiClient: AxiosInstance;

  constructor(clientId: string, clientSecret: string, redirectUri: string) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.redirectUri = redirectUri;

    this.apiClient = axios.create({
      baseURL: "https://api.spotify.com/v1",
      headers: {
        "Content-Type": "application/json",
      },
    });
  }

  /**
   * Generate Spotify authorization URL for OAuth flow
   */
  public getAuthUrl(listenerId: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: "code",
      redirect_uri: this.redirectUri,
      scope: "user-modify-playback-state user-read-playback-state",
      state: listenerId, // Use listenerId as state for verification
    });

    return `https://accounts.spotify.com/authorize?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access and refresh tokens
   */
  public async handleCallback(code: string, listenerId: string): Promise<TokenInfo> {
    try {
      const response = await axios.post(
        "https://accounts.spotify.com/api/token",
        new URLSearchParams({
          grant_type: "authorization_code",
          code: code,
          redirect_uri: this.redirectUri,
        }),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64")}`,
          },
        }
      );

      const tokenInfo: TokenInfo = {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token,
        expiresAt: Date.now() + response.data.expires_in * 1000,
      };

      this.tokenStore.set(listenerId, tokenInfo);
      console.log(`Tokens stored for listenerId: ${listenerId}`);

      return tokenInfo;
    } catch (error: any) {
      console.error("Error exchanging code for tokens:", error.response?.data || error.message);
      throw new Error("Failed to exchange authorization code for tokens");
    }
  }

  /**
   * Get access token for a listener, refreshing if needed
   */
  public async getAccessToken(listenerId: string): Promise<string> {
    const tokenInfo = this.tokenStore.get(listenerId);
    if (!tokenInfo) {
      throw new Error(`No tokens found for listenerId: ${listenerId}`);
    }

    // Check if token needs refresh (refresh 5 minutes before expiry)
    if (Date.now() >= tokenInfo.expiresAt - 5 * 60 * 1000) {
      await this.refreshToken(listenerId);
    }

    return this.tokenStore.get(listenerId)!.accessToken;
  }

  /**
   * Refresh access token using refresh token
   */
  private async refreshToken(listenerId: string): Promise<void> {
    const tokenInfo = this.tokenStore.get(listenerId);
    if (!tokenInfo) {
      throw new Error(`No tokens found for listenerId: ${listenerId}`);
    }

    try {
      const response = await axios.post(
        "https://accounts.spotify.com/api/token",
        new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: tokenInfo.refreshToken,
        }),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64")}`,
          },
        }
      );

      const newTokenInfo: TokenInfo = {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token || tokenInfo.refreshToken, // Spotify may not return refresh token
        expiresAt: Date.now() + response.data.expires_in * 1000,
      };

      this.tokenStore.set(listenerId, newTokenInfo);
      console.log(`Tokens refreshed for listenerId: ${listenerId}`);
    } catch (error: any) {
      console.error("Error refreshing token:", error.response?.data || error.message);
      // Remove invalid tokens
      this.tokenStore.delete(listenerId);
      throw new Error("Failed to refresh token. Please re-authenticate.");
    }
  }

  /**
   * Search for a track on Spotify
   * Requires authentication - uses the listener's access token
   * 
   * TODO: Improve search matching - currently just searches by track name and uses top result.
   * Consider adding artist matching, fuzzy matching, or confidence scoring for better accuracy.
   */
  public async searchTrack(listenerId: string, title: string): Promise<string | null> {
    try {
      const accessToken = await this.getAccessToken(listenerId);
      // Search by track name only, Spotify will return top-rated/most popular result
      const response = await this.apiClient.get("/search", {
        params: {
          q: title,
          type: "track",
          limit: 1,
        },
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const tracks = response.data.tracks?.items;
      if (tracks && tracks.length > 0) {
        return tracks[0].uri; // Returns spotify:track:ID format (top result)
      }

      return null;
    } catch (error: any) {
      console.error("Error searching track:", error.response?.data || error.message);
      throw new Error("Failed to search track on Spotify");
    }
  }

  /**
   * Get active Spotify device for a listener
   */
  public async getActiveDevice(listenerId: string): Promise<string | null> {
    try {
      const accessToken = await this.getAccessToken(listenerId);
      const response = await this.apiClient.get("/me/player", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (response.data && response.data.device) {
        return response.data.device.id;
      }

      return null;
    } catch (error: any) {
      if (error.response?.status === 204) {
        // No active device
        return null;
      }
      console.error("Error getting active device:", error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Play a track on Spotify
   */
  public async playTrack(
    listenerId: string,
    trackUri: string,
    positionMs: number
  ): Promise<void> {
    try {
      const accessToken = await this.getAccessToken(listenerId);

      await this.apiClient.put(
        "/me/player/play",
        {
          uris: [trackUri],
          position_ms: positionMs,
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );
    } catch (error: any) {
      if (error.response?.status === 403) {
        throw new Error("Premium account required");
      }
      if (error.response?.status === 404) {
        throw new Error("No active device found. Please open Spotify on a device.");
      }
      console.error("Error playing track:", error.response?.data || error.message);
      throw new Error("Failed to play track on Spotify");
    }
  }

  /**
   * Pause playback on Spotify
   */
  public async pausePlayback(listenerId: string): Promise<void> {
    try {
      const accessToken = await this.getAccessToken(listenerId);

      await this.apiClient.put(
        "/me/player/pause",
        {},
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );
    } catch (error: any) {
      if (error.response?.status === 403) {
        throw new Error("Premium account required");
      }
      if (error.response?.status === 404) {
        throw new Error("No active device found. Please open Spotify on a device.");
      }
      console.error("Error pausing playback:", error.response?.data || error.message);
      throw new Error("Failed to pause playback on Spotify");
    }
  }

  /**
   * Seek to a specific position in the current track
   */
  public async seekToPosition(listenerId: string, positionMs: number): Promise<void> {
    try {
      const accessToken = await this.getAccessToken(listenerId);

      await this.apiClient.put(
        `/me/player/seek?position_ms=${positionMs}`,
        {},
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );
    } catch (error: any) {
      if (error.response?.status === 403) {
        throw new Error("Premium account required");
      }
      if (error.response?.status === 404) {
        throw new Error("No active device found. Please open Spotify on a device.");
      }
      console.error("Error seeking:", error.response?.data || error.message);
      throw new Error("Failed to seek on Spotify");
    }
  }

  /**
   * Check if a listener has authenticated
   */
  public hasTokens(listenerId: string): boolean {
    return this.tokenStore.has(listenerId);
  }
}

