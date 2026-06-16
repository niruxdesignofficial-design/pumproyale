// Server entry point.
//
// Phase 1 stub: the authoritative Colyseus game server, Rapier physics
// simulation, matchmaking, REST API, and the Solana treasury signer are all
// introduced in later phases (3, 4, 6, 7). This stub only proves the workspace
// compiles and that shared constants are reachable from the server.
import { DEFAULT_SERVER_PORT, MAX_PLAYERS, TICK_RATE } from "@party-royale/shared";

function main(): void {
  console.log(
    `[server] stub (Phase 3). Planned: port=${DEFAULT_SERVER_PORT}, ` +
      `tick=${TICK_RATE}Hz, maxPlayers=${MAX_PLAYERS}.`,
  );
}

main();
