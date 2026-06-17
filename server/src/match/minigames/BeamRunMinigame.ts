import type RAPIER from "@dimforge/rapier3d-compat";
import { PHYS, beamRunMap, sweeperHit, type GameMap } from "@party-royale/shared";
import type { IMinigame, MinigameContext, MinigameType } from "../IMinigame";
import { buildMapColliders, removeColliders } from "../mapColliders";

const SPRING_COOLDOWN = 0.6;
const SWEEP_KNOCK = 8;
const BOT_LANE = 3.6;

/**
 * Obstacle race: cross the lane to the finish while rotating beams sweep you off
 * and springs bounce you along. Falling off respawns you at your last checkpoint
 * (time loss, not elimination). The first `survivorsTarget` to finish advance;
 * the rest are eliminated once enough finish or the timer runs out.
 */
export class BeamRunMinigame implements IMinigame {
  readonly id = "beamrun";
  readonly name = "Beam Run";
  readonly type: MinigameType = "qualify";
  readonly maxDuration = 45;

  private map: GameMap = beamRunMap();
  private colliders: RAPIER.Collider[] = [];
  private elapsed = 0;
  private readonly finished = new Set<string>();
  private readonly springTimer = new Map<string, number>();

  setup(ctx: MinigameContext): void {
    this.elapsed = 0;
    this.finished.clear();
    this.springTimer.clear();
    this.map = beamRunMap();
    ctx.state.minigame = this.name;
    ctx.setPlatformEnabled(false);
    this.colliders = buildMapColliders(ctx.physics, this.map);

    const ids = ctx.aliveIds();
    ids.forEach((id, i) => {
      const spawn = this.map.spawns[i % this.map.spawns.length]!;
      ctx.sims.get(id)?.respawn(spawn);
    });
  }

  update(ctx: MinigameContext, dt: number): void {
    this.elapsed += dt;
    const t = this.elapsed;

    for (const id of ctx.aliveIds()) {
      const sim = ctx.sims.get(id);
      if (!sim) continue;
      const p = sim.position;

      if (p.y < this.map.killY) {
        sim.respawn();
        continue;
      }

      // Sweeper knockback.
      if (sim.bumperCooldown <= 0) {
        for (const s of this.map.sweepers) {
          const hit = sweeperHit(s, t, p.x, p.z, PHYS.capsuleRadius);
          if (hit.hit) {
            sim.applyKnockback(hit.nx, hit.nz, SWEEP_KNOCK);
            break;
          }
        }
      }

      // Spring bounce.
      let cd = (this.springTimer.get(id) ?? 0) - dt;
      if (cd <= 0) {
        for (const s of this.map.springs) {
          if (Math.hypot(p.x - s.x, p.z - s.z) <= s.r + PHYS.capsuleRadius && p.y < 1.5) {
            sim.bounce(s.power);
            cd = SPRING_COOLDOWN;
            break;
          }
        }
      }
      this.springTimer.set(id, cd);

      // Checkpoints (bank the furthest passed line).
      for (const cz of this.map.checkpoints) {
        if (p.z >= cz) sim.setRespawn({ x: clampLane(p.x), y: 2, z: cz });
      }

      // Finish.
      if (!this.finished.has(id) && this.map.finishZ != null && p.z >= this.map.finishZ) {
        this.finished.add(id);
      }
    }

    if (this.finished.size >= ctx.survivorsTarget()) {
      for (const id of ctx.aliveIds()) if (!this.finished.has(id)) ctx.eliminate(id, "too slow");
    }

    if (this.elapsed >= this.maxDuration && ctx.aliveIds().length > ctx.survivorsTarget()) {
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
    removeColliders(ctx.physics, this.colliders);
    this.colliders = [];
    for (const id of ctx.aliveIds()) ctx.sims.get(id)?.setExternalPush(0, 0);
    ctx.setPlatformEnabled(true);
  }

  botTarget(id: string): { x: number; z: number } {
    // Send bots up a side lane (beyond the sweepers' reach) so they reliably finish.
    const side = id.charCodeAt(id.length - 1) % 2 === 0 ? BOT_LANE : -BOT_LANE;
    return { x: side, z: (this.map.finishZ ?? 18) + 4 };
  }
}

function clampLane(x: number): number {
  return Math.max(-3.5, Math.min(3.5, x));
}
