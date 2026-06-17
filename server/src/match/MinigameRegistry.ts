import type { IMinigame } from "./IMinigame";
import { BeamRunMinigame } from "./minigames/BeamRunMinigame";
import { HexFallMinigame } from "./minigames/HexFallMinigame";

/**
 * Round sequence for a match: a wide bright race (qualifier) then Hex-A-Gone as
 * the final, last-one-standing decider. Two clear, readable Fall-Guys rounds.
 */
export function buildRoundPlan(_playerCount: number): IMinigame[] {
  return [new BeamRunMinigame(), new HexFallMinigame()];
}
