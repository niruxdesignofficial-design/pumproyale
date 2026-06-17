import { Schema, MapSchema, ArraySchema, defineTypes } from "@colyseus/schema";

/**
 * Authoritative per-player state synced to clients. Position/yaw/anim are written
 * by the server simulation each tick. Clients render this; they cannot write it.
 */
export class PlayerState extends Schema {
  name = "";
  wallet = "";
  character = "knight";
  colorIndex = 0;
  x = 0;
  y = 0;
  z = 0;
  yaw = 0;
  anim = "idle";
  alive = true;
  /** Bot players are filled in to reach the match size. */
  isBot = false;
  /** Final match placement by total points (0 until the match ends). */
  placement = 0;
  /** Total points across all minigames played so far. */
  points = 0;
  /** Raw score in the current minigame (goals / hits / gems / climb rank). */
  roundScore = 0;
}

defineTypes(PlayerState, {
  name: "string",
  wallet: "string",
  character: "string",
  colorIndex: "number",
  x: "number",
  y: "number",
  z: "number",
  yaw: "number",
  anim: "string",
  alive: "boolean",
  isBot: "boolean",
  placement: "number",
  points: "number",
  roundScore: "number",
});

/**
 * A dynamic minigame object the client renders at server-authoritative
 * transforms: the soccer ball, shooting targets, collectible gems. The active
 * minigame owns this list; it is cleared between rounds.
 */
export class EntityState extends Schema {
  kind = "";
  x = 0;
  y = 0;
  z = 0;
  yaw = 0;
  active = true;
  /** Visual variant index (e.g. which gem model / team color). */
  variant = 0;
}

defineTypes(EntityState, {
  kind: "string",
  x: "number",
  y: "number",
  z: "number",
  yaw: "number",
  active: "boolean",
  variant: "number",
});

/**
 * Top-level match state. The match plays every minigame in order; players
 * accumulate points and the highest total wins (no elimination).
 */
export class MatchState extends Schema {
  players = new MapSchema<PlayerState>();
  phase = "waiting";
  /** Current round (1-based) while playing. */
  round = 0;
  /** Total rounds in the match. */
  roundCount = 0;
  minigame = "";
  /** Seconds remaining in the current phase, for the HUD. */
  timer = 0;
  /** Players in the match (humans + bots). */
  alive = 0;
  /** Seconds since the current round started; drives deterministic visuals. */
  roundClock = 0;
  /** Dynamic objects for the active minigame (ball / targets / gems). */
  entities = new ArraySchema<EntityState>();
  /** Crumbling-floor tile liveness (true = present). Empty outside that round. */
  tiles = new ArraySchema<boolean>();
  winnerId = "";
  winnerName = "";
}

defineTypes(MatchState, {
  players: { map: PlayerState },
  phase: "string",
  round: "number",
  roundCount: "number",
  minigame: "string",
  timer: "number",
  alive: "number",
  roundClock: "number",
  entities: [EntityState],
  tiles: ["boolean"],
  winnerId: "string",
  winnerName: "string",
});
