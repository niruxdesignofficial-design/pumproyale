// Authoritative game server entry point.
//
// Boots a Colyseus server over a WebSocket transport and registers the match
// room. The REST API (leaderboard, auth, rewards) is added on a separate port
// in Phases 6 and 7.
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { DEFAULT_SERVER_PORT, MATCH_ROOM, TICK_RATE } from "@party-royale/shared";
import { MatchRoom } from "./rooms/MatchRoom";

const port = Number(process.env.SERVER_PORT ?? DEFAULT_SERVER_PORT);

const gameServer = new Server({
  transport: new WebSocketTransport(),
});

gameServer.define(MATCH_ROOM, MatchRoom);

gameServer
  .listen(port)
  .then(() => {
    console.log(`[server] Colyseus listening on ws://localhost:${port} (tick ${TICK_RATE}Hz)`);
  })
  .catch((err: unknown) => {
    console.error("[server] failed to start:", err);
    process.exit(1);
  });
