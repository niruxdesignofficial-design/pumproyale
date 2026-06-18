// Authoritative game server entry point.
//
// Boots a Colyseus server over a WebSocket transport and registers the match
// room. The optional REST API (leaderboard, auth, rewards) is only started when
// ENABLE_API=1, since the public client runs offline-style and does not need it;
// real multiplayer only needs the Colyseus game server.
import { createServer } from "node:http";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import {
  DEFAULT_API_PORT,
  DEFAULT_SERVER_PORT,
  MATCH_ROOM,
  TICK_RATE,
} from "@party-royale/shared";
import { MatchRoom } from "./rooms/MatchRoom";
import { startApiServer } from "./api/server";

// Hosting platforms (Railway/Render/Fly) inject PORT and expose a single port.
const gamePort = Number(process.env.PORT ?? process.env.SERVER_PORT ?? DEFAULT_SERVER_PORT);
const apiPort = Number(process.env.API_PORT ?? DEFAULT_API_PORT);

async function main(): Promise<void> {
  // Own the HTTP server so we can answer health checks ("/" and "/health").
  // Colyseus attaches its matchmaking routes (with CORS) on top of this server
  // and falls back to this handler for any non-matchmaking request.
  const httpServer = createServer((req, res) => {
    if (req.url === "/" || req.url === "/health") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("PumpRoyale server ok");
      return;
    }
    res.writeHead(404);
    res.end();
  });

  const gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer }) });
  gameServer.define(MATCH_ROOM, MatchRoom);
  await gameServer.listen(gamePort);
  console.log(`[server] Colyseus listening on :${gamePort} (tick ${TICK_RATE}Hz)`);

  if (process.env.ENABLE_API === "1") {
    await startApiServer(apiPort);
    console.log(`[server] REST API listening on http://localhost:${apiPort}`);
  }
}

main().catch((err: unknown) => {
  console.error("[server] failed to start:", err);
  process.exit(1);
});
