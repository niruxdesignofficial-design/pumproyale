import type { InputIntent } from "@party-royale/shared";
import type { PhysicsWorld } from "../physics/PhysicsWorld";
import type { PlayerSim } from "../physics/PlayerSim";
import type { EntityState, MatchState } from "../rooms/schema";

/**
 * A bot's high-level intent for a tick: where to go, whether to press the action
 * button, and an optional forced jump (e.g. to clear a known gap or dodge a
 * hazard). `BotController` turns this into smart movement (steering, edge/gap
 * jumping, skill noise).
 */
export interface BotPlan {
  tx: number;
  tz: number;
  action?: boolean;
  /** Force a jump this tick (overrides the controller's own jump heuristic). */
  jump?: boolean;
  /** Hold position (do not advance) — used to wait out a hazard. */
  hold?: boolean;
}

/**
 * Everything a minigame needs from the room to run a round. The room owns the
 * physics world, the live player sims, and the synced state. Minigames read
 * positions/inputs and write each player's `roundScore`; the room turns those
 * scores into placement points at round end. Nobody is eliminated.
 */
export interface MinigameContext {
  readonly physics: PhysicsWorld;
  readonly state: MatchState;
  /** Session id -> sim for every participant (humans + bots). */
  readonly sims: Map<string, PlayerSim>;
  /** Session ids of all participants. */
  players(): string[];
  /** Add to a player's current-round score (synced live to clients). */
  addScore(id: string, delta: number): void;
  /** Set a player's current-round score outright. */
  setScore(id: string, score: number): void;
  getScore(id: string): number;
  /** Consume the action-button edge (kick / shoot) for a player, if any. */
  consumeAction(id: string): boolean;
  /** A player's facing direction on the ground plane (unit vector). */
  facing(id: string): { x: number; z: number };
  /** A player's aim direction (camera forward) on the ground plane (unit vector);
   * falls back to facing for bots / clients that don't send an aim. */
  aim(id: string): { x: number; z: number };
  /** Append a synced dynamic entity (ball / target / gem) and return it. */
  addEntity(kind: string, variant?: number): EntityState;
  /** Toggle the solid lobby platform collider (minigames build their own floor). */
  setPlatformEnabled(enabled: boolean): void;
  /** Show a transient banner (e.g. a goal announcement) for a couple seconds. */
  setBanner(text: string): void;
  /** Index of this bot among the bots (stable per round), for route/role splits. */
  botIndex(id: string): number;
}

/**
 * A round of the match. Each implementation is a self-contained minigame: it
 * builds its colliders/entities in setup, runs per-tick logic in update (writing
 * scores), reports when the round is over, and cleans up in teardown.
 */
export interface IMinigame {
  readonly id: string;
  readonly name: string;
  /** Hard cap on round length (seconds); the room enforces a failsafe finish. */
  readonly maxDuration: number;
  setup(ctx: MinigameContext): void;
  update(ctx: MinigameContext, dt: number): void;
  isComplete(ctx: MinigameContext): boolean;
  teardown(ctx: MinigameContext): void;
  /**
   * Smart per-bot plan for this round (target point + action/jump). The room
   * feeds it through `BotController` for steering. Falls back to the arena center
   * when omitted.
   */
  botPlan?(id: string, ctx: MinigameContext, dt: number): BotPlan;
}

export type { InputIntent };
