import type { PhysicsWorld } from "../physics/PhysicsWorld";
import type { PlayerSim } from "../physics/PlayerSim";
import type { EntityState, MatchState } from "../rooms/schema";

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
  /** Suggested goal point a bot heads toward this round. */
  botTarget(id: string): { x: number; z: number };
  /** Consume the action-button edge (kick / shoot) for a player, if any. */
  consumeAction(id: string): boolean;
  /** A player's facing direction on the ground plane (unit vector). */
  facing(id: string): { x: number; z: number };
  /** Append a synced dynamic entity (ball / target / gem) and return it. */
  addEntity(kind: string, variant?: number): EntityState;
  /** Toggle the solid lobby platform collider (minigames build their own floor). */
  setPlatformEnabled(enabled: boolean): void;
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
  /** Optional per-bot goal point for this round; defaults to arena center. */
  botTarget?(id: string, ctx: MinigameContext): { x: number; z: number };
  /** Whether a bot should press the action button this tick (kick / shoot). */
  botAction?(id: string, ctx: MinigameContext): boolean;
}
