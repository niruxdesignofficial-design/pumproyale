import { ARENA, PHYS, spawnPoint } from "@party-royale/shared";
import type { IMinigame, MinigameContext } from "../IMinigame";

const START_RADIUS = ARENA.platformHalf - 1;
const END_RADIUS = 1.2;

/**
 * King-of-the-hill survival: a safe circle shrinks over time. Players outside it
 * (or who fall off) are eliminated. The last one inside wins. A failsafe at the
 * time limit eliminates everyone but the player closest to center, so the round
 * always resolves to a single survivor.
 */
export class SurvivalMinigame implements IMinigame {
  readonly id = "survival";
  readonly name = "Last One Standing";
  readonly maxDuration = 45;

  private elapsed = 0;

  setup(ctx: MinigameContext): void {
    this.elapsed = 0;
    ctx.state.minigame = this.name;
    ctx.state.zoneRadius = START_RADIUS;

    // Reset survivors onto the spawn ring for a clean start.
    const ids = ctx.aliveIds();
    ids.forEach((id, i) => {
      ctx.sims.get(id)?.respawn(spawnPoint(i, ids.length));
    });
  }

  update(ctx: MinigameContext, dt: number): void {
    this.elapsed += dt;
    const t = Math.min(1, this.elapsed / this.maxDuration);
    const radius = START_RADIUS + (END_RADIUS - START_RADIUS) * t;
    ctx.state.zoneRadius = radius;

    for (const id of ctx.aliveIds()) {
      const sim = ctx.sims.get(id);
      if (!sim) continue;
      const p = sim.position;
      if (p.y < ARENA.fallY) {
        ctx.eliminate(id, "fell");
        continue;
      }
      if (Math.hypot(p.x, p.z) > radius + PHYS.capsuleRadius) {
        ctx.eliminate(id, "zone");
      }
    }

    // Failsafe: at the time limit keep only the player closest to center.
    if (this.elapsed >= this.maxDuration) {
      const ranked = ctx
        .aliveIds()
        .map((id) => {
          const p = ctx.sims.get(id)!.position;
          return { id, d: Math.hypot(p.x, p.z) };
        })
        .sort((a, b) => a.d - b.d);
      for (const r of ranked.slice(1)) ctx.eliminate(r.id, "timeout");
    }
  }

  isComplete(ctx: MinigameContext): boolean {
    return ctx.aliveIds().length <= 1;
  }

  teardown(ctx: MinigameContext): void {
    ctx.state.zoneRadius = 0;
  }

  botTarget(): { x: number; z: number } {
    // Survive by heading to the center of the shrinking zone.
    return { x: 0, z: 0 };
  }
}
