import type { IMinigame } from "./IMinigame";
import { FootballMinigame } from "./minigames/FootballMinigame";
import { ShootingMinigame } from "./minigames/ShootingMinigame";
import { ClimbMinigame } from "./minigames/ClimbMinigame";
import { GemsMinigame } from "./minigames/GemsMinigame";

/**
 * The match plays all four minigames in order. Everyone plays every round;
 * points accumulate and the highest total wins (no elimination).
 */
export function buildRoundPlan(_playerCount: number): IMinigame[] {
  return [
    new FootballMinigame(),
    new ShootingMinigame(),
    new ClimbMinigame(),
    new GemsMinigame(),
  ];
}
