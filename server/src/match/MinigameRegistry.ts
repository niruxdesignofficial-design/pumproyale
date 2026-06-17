import type { IMinigame } from "./IMinigame";
import { FootballMinigame } from "./minigames/FootballMinigame";
import { GemsMinigame } from "./minigames/GemsMinigame";
import { ClimbMinigame } from "./minigames/ClimbMinigame";
import { ShootingMinigame } from "./minigames/ShootingMinigame";

/** Factories for the minigame pool (every match plays all of them). */
const POOL: Array<() => IMinigame> = [
  () => new FootballMinigame(),
  () => new GemsMinigame(),
  () => new ClimbMinigame(),
  () => new ShootingMinigame(),
];

/** Fisher-Yates shuffle (returns a new array). */
function shuffle<T>(arr: T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * Every match plays all four minigames, but in a random order each time so no two
 * matches open or close the same way. Everyone plays every round; points
 * accumulate and the highest total wins (no elimination).
 */
export function buildRoundPlan(_playerCount: number): IMinigame[] {
  return shuffle(POOL).map((make) => make());
}
