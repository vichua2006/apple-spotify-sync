import express from "express";
import { createServer } from "http";
import dotenv from "dotenv";
import { WebSocketRelay } from "./websocket";
import { SpotifyClient } from "./spotify";
import { createRoutes } from "./routes";

// Load environment variables
dotenv.config();

// Validate required environment variables
const requiredEnvVars = [
  "SPOTIFY_CLIENT_ID",
  "SPOTIFY_CLIENT_SECRET",
  "SPOTIFY_REDIRECT_URI",
];

const missingVars = requiredEnvVars.filter((varName) => !process.env[varName]);

if (missingVars.length > 0) {
  console.error("Missing required environment variables:");
  missingVars.forEach((varName) => console.error(`  - ${varName}`));
  process.exit(1);
}

const PORT = parseInt(process.env.PORT || "3000", 10);
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID!;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET!;
const SPOTIFY_REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI!;

// Initialize Express app
const app = express();
app.use(express.json());

// Create HTTP server
const server = createServer(app);

// Initialize Spotify client
const spotifyClient = new SpotifyClient(
  SPOTIFY_CLIENT_ID,
  SPOTIFY_CLIENT_SECRET,
  SPOTIFY_REDIRECT_URI
);

// Initialize WebSocket relay
const wsRelay = new WebSocketRelay(server);

// Register routes
const routes = createRoutes(spotifyClient);
app.use("/", routes);

// Start server
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`WebSocket server ready on ws://localhost:${PORT}`);
  console.log(`Spotify OAuth redirect URI: ${SPOTIFY_REDIRECT_URI}`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully");
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  console.log("SIGINT received, shutting down gracefully");
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});

