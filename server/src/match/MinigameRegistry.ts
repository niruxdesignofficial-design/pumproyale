import type { IMinigame } from "./IMinigame";
import { FootballMinigame } from "./minigames/FootballMinigame";
import { GemsMinigame } from "./minigames/GemsMinigame";
import { ClimbMinigame } from "./minigames/ClimbMinigame";
import { ShootingMinigame } from "./minigames/ShootingMinigame";

/**
 * The match plays all four minigames in order. Everyone plays every round;
 * points accumulate and the highest total wins (no elimination). Shooting is
 * last (it is the calmest, a good closer).
 */
export function buildRoundPlan(_playerCount: number): IMinigame[] {
  return [
    new FootballMinigame(),
    new GemsMinigame(),
    new ClimbMinigame(),
    new ShootingMinigame(),
  ];
}
