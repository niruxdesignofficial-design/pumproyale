import { ARENA, PHYS, RACE, hammerHead, sawPos } from "@party-royale/shared";
import type { IMinigame, MinigameContext } from "../IMinigame";

/**
 * Obstacle Race: cross from the start line to the finish line while rotating
 * hammers and sliding sawblades knock you around and a conveyor pushes you back.
 * The first `survivorsTarget` players to finish advance; the rest are eliminated
 * when enough have finished or the time limit hits. Obstacles move as a function
 * of the synced round clock, so client visuals and server hits stay aligned.
 */
export class ObstacleRaceMinigame implements IMinigame {
  readonly id = "race";
  readonly name = "Obstacle Race";
  readonly maxDuration = 60;

  private readonly finished = new Set<string>();

  setup(ctx: MinigameContext): void {
    ctx.state.minigame = this.name;
    ctx.setPlatformEnabled(true);
    this.finished.clear();

    const ids = ctx.aliveIds();
    ids.forEach((id, i) => {
      const lane = ids.length > 1 ? i / (ids.length - 1) : 0.5;
      const x = (lane - 0.5) * (ARENA.platformHalf * 1.6);
      ctx.sims.get(id)?.respawn({ x, y: 2, z: RACE.startZ });
    });
  }

  update(ctx: MinigameContext, _dt: number): void {
    const t = ctx.state.roundClock;

    for (const id of ctx.aliveIds()) {
      const sim = ctx.sims.get(id);
      if (!sim) continue;
      const p = sim.position;

      if (p.y < ARENA.fallY) {
        ctx.eliminate(id, "fell");
        continue;
      }

      // Conveyor push (reset each tick, summed over zones the player is in).
      let pushX = 0;
      let pushZ = 0;
      for (const c of RACE.conveyors) {
        if (Math.abs(p.x - c.x) <= c.width / 2 && Math.abs(p.z - c.z) <= c.depth / 2) {
          pushX += c.dirX * c.force;
          pushZ += c.dirZ * c.force;
        }
      }
      sim.setExternalPush(pushX, pushZ);

      // Hammer / saw proximity knockback.
      if (sim.bumperCooldown <= 0) {
        if (this.hitMovingHazards(sim, p, t)) continue;
      }

      // Finish line.
      if (!this.finished.has(id) && p.z >= RACE.finishZ) {
        this.finished.add(id);
      }
    }

    // Enough finished: eliminate the stragglers.
    if (this.finished.size >= ctx.survivorsTarget()) {
      for (const id of ctx.aliveIds()) {
        if (!this.finished.has(id)) ctx.eliminate(id, "too slow");
      }
    }

    // Time limit: eliminate by least progress (z) until the target remains.
    if (t >= this.maxDuration && ctx.aliveIds().length > ctx.survivorsTarget()) {
      const ranked = ctx
        .aliveIds()
        .map((id) => ({ id, z: ctx.sims.get(id)!.position.z }))
        .sort((a, b) => b.z - a.z);
      for (const r of ranked.slice(ctx.survivorsTarget())) ctx.eliminate(r.id, "timeout");
    }
  }

  isComplete(ctx: MinigameContext): boolean {
    return ctx.aliveIds().length <= ctx.survivorsTarget();
  }

  teardown(ctx: MinigameContext): void {
    for (const id of ctx.aliveIds()) ctx.sims.get(id)?.setExternalPush(0, 0);
  }

  botTarget(): { x: number; z: number } {
    return { x: 0, z: RACE.finishZ + 2 };
  }

  private hitMovingHazards(
    sim: { applyKnockback(x: number, z: number, s: number): void },
    p: { x: number; z: number },
    t: number,
  ): boolean {
    for (const h of RACE.hammers) {
      const head = hammerHead(h, t);
      const dx = p.x - head.x;
      const dz = p.z - head.z;
      const d = Math.hypot(dx, dz);
      if (d <= RACE.hammerHeadRadius + PHYS.capsuleRadius) {
        const inv = d > 1e-4 ? 1 / d : 0;
        sim.applyKnockback(inv === 0 ? 1 : dx * inv, inv === 0 ? 0 : dz * inv, RACE.hammerKnock);
        return true;
      }
    }
    for (const s of RACE.saws) {
      const pos = sawPos(s, t);
      const dx = p.x - pos.x;
      const dz = p.z - pos.z;
      const d = Math.hypot(dx, dz);
      if (d <= s.radius + PHYS.capsuleRadius) {
        const inv = d > 1e-4 ? 1 / d : 0;
        sim.applyKnockback(inv === 0 ? 1 : dx * inv, inv === 0 ? 0 : dz * inv, RACE.sawKnock);
        return true;
      }
    }
    return false;
  }
}
