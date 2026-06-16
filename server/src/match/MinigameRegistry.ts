import type { IMinigame } from "./IMinigame";
import { SurvivalMinigame } from "./minigames/SurvivalMinigame";

/**
 * Registry of available minigames. Adding a new minigame to rotation is a single
 * line here (plus its implementation file). Phase 5 adds Obstacle Race and Hex
 * Fall alongside Survival.
 */
const FACTORIES: Array<() => IMinigame> = [
  () => new SurvivalMinigame(),
  // Phase 5: () => new ObstacleRaceMinigame(), () => new HexFallMinigame(),
];

export function minigameCount(): number {
  return FACTORIES.length;
}

/** Create the minigame for a given round index (wraps around the rotation). */
export function createMinigame(roundIndex: number): IMinigame {
  const factory = FACTORIES[roundIndex % FACTORIES.length]!;
  return factory();
}
