import type { PhysicsWorld } from "../physics/PhysicsWorld";
import type { PlayerSim } from "../physics/PlayerSim";
import type { MatchState } from "../rooms/schema";

/**
 * Everything a minigame needs from the room to run a round. The room owns the
 * physics world, the live player sims, and the synced state; minigames read
 * positions and call `eliminate` to knock players out.
 */
export interface MinigameContext {
  readonly physics: PhysicsWorld;
  readonly state: MatchState;
  /** Map of session id -> sim for players still in the match. */
  readonly sims: Map<string, PlayerSim>;
  /** Session ids of players still in the match. */
  aliveIds(): string[];
  /** Knock a player out of the match (assigns placement, frees its body). */
  eliminate(id: string, reason: string): void;
  /** Suggested goal point a bot should head toward this round (defaults to center). */
  botTarget(id: string): { x: number; z: number };
  /** Number of players that should survive this round (round ends at this count). */
  survivorsTarget(): number;
  /** Toggle the solid base platform collider (Hex Fall disables it). */
  setPlatformEnabled(enabled: boolean): void;
}

/**
 * A round of the match. Each implementation is a self-contained minigame: it
 * builds its own obstacles in setup, runs per-tick logic in update (eliminating
 * players as appropriate), reports when the round is over, and cleans up in
 * teardown. Registering a new minigame is all it takes to add one to rotation.
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
  /** Optional per-bot goal point for this round; defaults to arena center. */
  botTarget?(id: string, ctx: MinigameContext): { x: number; z: number };
}
