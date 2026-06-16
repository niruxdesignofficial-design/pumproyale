import type { IMinigame } from "./IMinigame";
import { ObstacleRaceMinigame } from "./minigames/ObstacleRaceMinigame";
import { HexFallMinigame } from "./minigames/HexFallMinigame";
import { SurvivalMinigame } from "./minigames/SurvivalMinigame";

/**
 * Registry of available minigames, in round rotation order. A match plays them
 * in sequence (race, then hex, then survival as the decider), wrapping around if
 * more rounds are needed. Adding a minigame is a single line here.
 */
const FACTORIES: Array<() => IMinigame> = [
  () => new ObstacleRaceMinigame(),
  () => new HexFallMinigame(),
  () => new SurvivalMinigame(),
];

export function minigameCount(): number {
  return FACTORIES.length;
}

/** Create the minigame for a given round index (wraps around the rotation). */
export function createMinigame(roundIndex: number): IMinigame {
  const factory = FACTORIES[roundIndex % FACTORIES.length]!;
  return factory();
}
