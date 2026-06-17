import type { IMinigame, MinigameType } from "./IMinigame";
import { BeamRunMinigame } from "./minigames/BeamRunMinigame";
import { HexFallMinigame } from "./minigames/HexFallMinigame";
import { SinkingIslandMinigame } from "./minigames/SinkingIslandMinigame";
import { CrownGrabMinigame } from "./minigames/CrownGrabMinigame";

type Factory = () => IMinigame;

/** Minigames grouped by round type, so the director can pick appropriate rounds. */
const POOLS: Record<MinigameType, Factory[]> = {
  qualify: [() => new BeamRunMinigame()],
  survival: [() => new HexFallMinigame(), () => new SinkingIslandMinigame()],
  final: [() => new CrownGrabMinigame()],
};

function pick(type: MinigameType): IMinigame {
  const pool = POOLS[type];
  const factory = pool[Math.floor(Math.random() * pool.length)]!;
  return factory();
}

/**
 * Build the round sequence for a match: a qualify round, then survival rounds,
 * then a final, sized to the number of players so it ladders down to one winner.
 * Avoids repeating the same minigame within a match where possible.
 */
export function buildRoundPlan(playerCount: number): IMinigame[] {
  const plan: IMinigame[] = [];
  const used = new Set<string>();

  const add = (type: MinigameType) => {
    let g = pick(type);
    // Try to avoid repeats within the match.
    for (let i = 0; i < 3 && used.has(g.id); i++) g = pick(type);
    used.add(g.id);
    plan.push(g);
  };

  // One elimination per round; reserve the last as a final.
  const rounds = Math.max(1, playerCount - 1);
  for (let i = 0; i < rounds - 1; i++) add(i === 0 ? "qualify" : "survival");
  add("final");
  return plan;
}
