import type RAPIER from "@dimforge/rapier3d-compat";
import {
  CLIMB_FINISH_Y,
  CLIMB_STEPS,
  PHYS,
  climbMap,
  sweeperHit,
  type MinigameMap,
} from "@party-royale/shared";
import type { IMinigame, MinigameContext } from "../IMinigame";
import { buildMapColliders, removeColliders } from "../mapColliders";

const SWEEP_KNOCK = 8;
const SPIKE_KNOCK = 10;

interface Climber {
  maxY: number;
  finished: boolean;
  checkpoint: { x: number; y: number; z: number };
}

/** Finishers score far above climbers, ranked by who reached the top first. */
const FINISH_BASE = 1000;

/**
 * Climb. Jump up the stepped platforms to the flag at the summit. First to the
 * top wins the round; whoever does not finish is ranked by how high they got.
 */
export class ClimbMinigame implements IMinigame {
  readonly id = "climb";
  readonly name = "Tower Climb";
  readonly maxDuration = 70;

  private map: MinigameMap = climbMap();
  private colliders: RAPIER.Collider[] = [];
  private readonly climbers = new Map<string, Climber>();
  private finishOrder = 0;
  private elapsed = 0;

  setup(ctx: MinigameContext): void {
    this.elapsed = 0;
    this.finishOrder = 0;
    this.climbers.clear();
    this.map = climbMap();
    ctx.state.minigame = this.name;
    ctx.setPlatformEnabled(false);
    this.colliders = buildMapColliders(ctx.physics, this.map);

    this.map.spawns.forEach((s, i) => {
      const id = ctx.players()[i];
      if (!id) return;
      ctx.sims.get(id)?.respawn(s);
      this.climbers.set(id, { maxY: s.y, finished: false, checkpoint: { ...s } });
      ctx.setScore(id, s.y);
    });
  }

  update(ctx: MinigameContext, dt: number): void {
    this.elapsed += dt;

    for (const id of ctx.players()) {
      const sim = ctx.sims.get(id);
      const c = this.climbers.get(id);
      if (!sim || !c) continue;
      const p = sim.position;

      // Bank a checkpoint when standing on a step.
      const step = stepUnder(p.x, p.y, p.z);
      if (step) c.checkpoint = { x: p.x, y: step.y + 0.8, z: p.z };

      // Rotating sweeper bars: jumping above the bar clears it.
      if (sim.bumperCooldown <= 0) {
        for (const s of this.map.sweepers ?? []) {
          if (p.y > s.y + s.thickness / 2 + 0.5) continue;
          const hit = sweeperHit(s, this.elapsed, p.x, p.z, PHYS.capsuleRadius);
          if (hit.hit) {
            sim.applyKnockback(hit.nx, hit.nz, SWEEP_KNOCK);
            break;
          }
        }
      }

      // Spike-roller proximity hazards.
      if (sim.bumperCooldown <= 0) {
        for (const h of this.map.hazards ?? []) {
          if (Math.abs(p.y - h.y) > 1.5) continue;
          const dx = p.x - h.x;
          const dz = p.z - h.z;
          const d = Math.hypot(dx, dz);
          if (d <= h.radius + PHYS.capsuleRadius) {
            const inv = d > 1e-4 ? 1 / d : 0;
            sim.applyKnockback(inv === 0 ? 1 : dx * inv, inv === 0 ? 0 : dz * inv, SPIKE_KNOCK);
            break;
          }
        }
      }

      if (p.y < this.map.killY) {
        sim.respawn(c.checkpoint);
        continue;
      }

      if (!c.finished) {
        c.maxY = Math.max(c.maxY, p.y);
        if (p.y >= CLIMB_FINISH_Y - 0.4 && onSummit(p.x, p.z)) {
          c.finished = true;
          ctx.setScore(id, FINISH_BASE - this.finishOrder);
          this.finishOrder += 1;
        } else {
          ctx.setScore(id, c.maxY);
        }
      }
    }
  }

  isComplete(ctx: MinigameContext): boolean {
    if (this.elapsed >= this.maxDuration) return true;
    const ids = ctx.players();
    return ids.length > 0 && ids.every((id) => this.climbers.get(id)?.finished);
  }

  teardown(ctx: MinigameContext): void {
    removeColliders(ctx.physics, this.colliders);
    this.colliders = [];
    this.climbers.clear();
    ctx.setPlatformEnabled(true);
  }

  /** Bots head for the next step up from their current height. */
  botTarget(id: string, ctx: MinigameContext): { x: number; z: number } {
    const sim = ctx.sims.get(id);
    const y = sim ? sim.position.y : 0;
    let next = CLIMB_STEPS[CLIMB_STEPS.length - 1]!;
    for (const s of CLIMB_STEPS) {
      if (s.y > y + 0.3) {
        next = s;
        break;
      }
    }
    return { x: next.x, z: next.z };
  }
}

function stepUnder(x: number, y: number, z: number) {
  for (const s of CLIMB_STEPS) {
    if (
      Math.abs(x - s.x) <= s.w / 2 &&
      Math.abs(z - s.z) <= s.d / 2 &&
      Math.abs(y - (s.y + 0.9)) <= 0.8
    ) {
      return s;
    }
  }
  return null;
}

function onSummit(x: number, z: number): boolean {
  const s = CLIMB_STEPS[CLIMB_STEPS.length - 1]!;
  return Math.abs(x - s.x) <= s.w / 2 + 0.5 && Math.abs(z - s.z) <= s.d / 2 + 0.5;
}
