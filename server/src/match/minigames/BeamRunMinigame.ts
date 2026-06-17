import type RAPIER from "@dimforge/rapier3d-compat";
import { PHYS, beamRunMap, sweeperHit, type GameMap } from "@party-royale/shared";
import type { IMinigame, MinigameContext, MinigameType } from "../IMinigame";
import { buildMapColliders, removeColliders } from "../mapColliders";

const SPRING_COOLDOWN = 0.6;
const SWEEP_KNOCK = 8;
const BOT_LANE = 3.6;
/** Once the first player finishes, everyone gets this long to also finish. */
const QUALIFY_WINDOW = 14;

/**
 * Obstacle race: cross the lane to the finish while rotating beams sweep you and
 * springs bounce you along. Falling off respawns you at your last checkpoint
 * (time loss, not elimination). When the first player finishes, a qualify window
 * opens so others have a fair chance; the round then resolves and the slowest
 * (by finish order, then by distance) are eliminated down to the survivor target.
 */
export class BeamRunMinigame implements IMinigame {
  readonly id = "beamrun";
  readonly name = "Beam Run";
  readonly type: MinigameType = "qualify";
  readonly maxDuration = 60;

  private map: GameMap = beamRunMap();
  private colliders: RAPIER.Collider[] = [];
  private elapsed = 0;
  private readonly finishOrder: string[] = [];
  private readonly finished = new Set<string>();
  private readonly springTimer = new Map<string, number>();
  private qualifyTimer = Infinity;
  private resolved = false;

  setup(ctx: MinigameContext): void {
    this.elapsed = 0;
    this.finishOrder.length = 0;
    this.finished.clear();
    this.springTimer.clear();
    this.qualifyTimer = Infinity;
    this.resolved = false;
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

      if (sim.bumperCooldown <= 0) {
        // Spinning bars: jumping above the bar clears it.
        for (const s of this.map.sweepers) {
          if (p.y > s.y + s.thickness / 2 + 0.5) continue;
          const hit = sweeperHit(s, t, p.x, p.z, PHYS.capsuleRadius);
          if (hit.hit) {
            sim.applyKnockback(hit.nx, hit.nz, SWEEP_KNOCK);
            break;
          }
        }
      }

      if (sim.bumperCooldown <= 0) {
        for (const b of this.map.bumpers) {
          const dx = p.x - b.x;
          const dz = p.z - b.z;
          const dist = Math.hypot(dx, dz);
          if (dist <= b.radius + PHYS.capsuleRadius + PHYS.bumperTriggerPad) {
            const inv = dist > 1e-4 ? 1 / dist : 0;
            sim.applyKnockback(inv === 0 ? 1 : dx * inv, inv === 0 ? 0 : dz * inv, PHYS.knockStrength);
            break;
          }
        }
      }

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

      for (const cz of this.map.checkpoints) {
        if (p.z >= cz) sim.setRespawn({ x: clampLane(p.x), y: 2, z: cz });
      }

      if (!this.finished.has(id) && this.map.finishZ != null && p.z >= this.map.finishZ) {
        this.finished.add(id);
        this.finishOrder.push(id);
      }
    }

    // Open the qualify window when the first racer finishes.
    if (this.qualifyTimer === Infinity && this.finishOrder.length > 0) {
      this.qualifyTimer = QUALIFY_WINDOW;
    }
    if (this.qualifyTimer !== Infinity) this.qualifyTimer -= dt;

    const aliveCount = ctx.aliveIds().length;
    const allFinished = this.finished.size >= aliveCount;
    const windowExpired = this.qualifyTimer !== Infinity && this.qualifyTimer <= 0;
    const timeUp = this.elapsed >= this.maxDuration;

    if (!this.resolved && (allFinished || windowExpired || timeUp)) {
      this.resolveRound(ctx);
      this.resolved = true;
    }
  }

  private resolveRound(ctx: MinigameContext): void {
    const target = ctx.survivorsTarget();
    const order = new Map<string, number>();
    this.finishOrder.forEach((id, i) => order.set(id, i));
    const ranked = ctx.aliveIds().slice().sort((a, b) => {
      const fa = order.has(a);
      const fb = order.has(b);
      if (fa && fb) return order.get(a)! - order.get(b)!;
      if (fa) return -1;
      if (fb) return 1;
      return ctx.sims.get(b)!.position.z - ctx.sims.get(a)!.position.z;
    });
    for (const id of ranked.slice(target)) {
      ctx.eliminate(id, order.has(id) ? "slowest" : "did not finish");
    }
  }

  isComplete(ctx: MinigameContext): boolean {
    return this.resolved && ctx.aliveIds().length <= ctx.survivorsTarget();
  }

  teardown(ctx: MinigameContext): void {
    removeColliders(ctx.physics, this.colliders);
    this.colliders = [];
    for (const id of ctx.aliveIds()) ctx.sims.get(id)?.setExternalPush(0, 0);
    ctx.setPlatformEnabled(true);
  }

  botTarget(id: string): { x: number; z: number } {
    const side = id.charCodeAt(id.length - 1) % 2 === 0 ? BOT_LANE : -BOT_LANE;
    return { x: side, z: (this.map.finishZ ?? 18) + 6 };
  }
}

function clampLane(x: number): number {
  return Math.max(-3.5, Math.min(3.5, x));
}
