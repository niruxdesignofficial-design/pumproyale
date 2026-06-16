import { Schema, MapSchema, defineTypes } from "@colyseus/schema";

/**
 * Authoritative per-player state synced to clients. Position/yaw/anim are written
 * by the server simulation each tick. Clients render this; they cannot write it.
 */
export class PlayerState extends Schema {
  name = "";
  wallet = "";
  x = 0;
  y = 0;
  z = 0;
  yaw = 0;
  anim = "idle";
  alive = true;
  /** Bot players are filled in to reach the match size (Phase 4). */
  isBot = false;
  /** Finishing rank, 0 while still in the match (Phase 4). */
  placement = 0;
}

defineTypes(PlayerState, {
  name: "string",
  wallet: "string",
  x: "number",
  y: "number",
  z: "number",
  yaw: "number",
  anim: "string",
  alive: "boolean",
  isBot: "boolean",
  placement: "number",
});

/**
 * Top-level match state.
 * `phase` and `round` drive the Phase 4 match flow; in Phase 3 the match simply
 * stays in "playing".
 */
export class MatchState extends Schema {
  players = new MapSchema<PlayerState>();
  phase = "lobby";
  round = 0;
  minigame = "";
  /** Seconds remaining in the current phase, for the HUD. */
  timer = 0;
  winnerId = "";
  winnerName = "";
}

defineTypes(MatchState, {
  players: { map: PlayerState },
  phase: "string",
  round: "number",
  minigame: "string",
  timer: "number",
  winnerId: "string",
  winnerName: "string",
});
