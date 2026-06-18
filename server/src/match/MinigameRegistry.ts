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

/** Dev-only: factory by minigame id, for forcing a soak plan via FORCE_PLAN. */
const BY_ID: Record<string, () => IMinigame> = {
  football: () => new FootballMinigame(),
  gems: () => new GemsMinigame(),
  climb: () => new ClimbMinigame(),
  shooting: () => new ShootingMinigame(),
};

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
  // Dev soak override: FORCE_PLAN="shooting,climb" plays exactly those, in order.
  const force = process.env.FORCE_PLAN;
  if (force) {
    const plan = force
      .split(",")
      .map((id) => BY_ID[id.trim()])
      .filter((f): f is () => IMinigame => Boolean(f))
      .map((f) => f());
    if (plan.length > 0) return plan;
  }
  return shuffle(POOL).map((make) => make());
}
