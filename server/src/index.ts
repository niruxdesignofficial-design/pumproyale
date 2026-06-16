// Authoritative game server entry point.
//
// Boots a Colyseus server over a WebSocket transport and registers the match
// room. The REST API (leaderboard, auth, rewards) is added on a separate port
// in Phases 6 and 7.
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

const gamePort = Number(process.env.SERVER_PORT ?? DEFAULT_SERVER_PORT);
const apiPort = Number(process.env.API_PORT ?? DEFAULT_API_PORT);

async function main(): Promise<void> {
  const gameServer = new Server({ transport: new WebSocketTransport() });
  gameServer.define(MATCH_ROOM, MatchRoom);
  await gameServer.listen(gamePort);
  console.log(`[server] Colyseus listening on ws://localhost:${gamePort} (tick ${TICK_RATE}Hz)`);

  await startApiServer(apiPort);
  console.log(`[server] REST API listening on http://localhost:${apiPort}`);
}

main().catch((err: unknown) => {
  console.error("[server] failed to start:", err);
  process.exit(1);
});
