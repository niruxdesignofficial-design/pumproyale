import type RAPIER from "@dimforge/rapier3d-compat";
import {
  CLIMB_FINISH_Y,
  CLIMB_ROUTES,
  PHYS,
  climbMap,
  climbPlatforms,
  climbSummit,
  launcherBall,
  sweeperHit,
  type ClimbStep,
  type MinigameMap,
} from "@party-royale/shared";
import type { BotPlan, IMinigame, MinigameContext } from "../IMinigame";
import { buildMapColliders, removeColliders } from "../mapColliders";

const SWEEP_KNOCK = 8;
const SPIKE_KNOCK = 10;
const BALL_KNOCK = 12;
const FINISH_BASE = 1000;

interface Climber {
  finished: boolean;
  checkpoint: { x: number; y: number; z: number };
}

/**
 * Climb to the flag via one of two routes (a long easy one or a short hard one
 * with sweepers, a spike roller, and side barrels that launch balls across the
 * path). Only players who reach the flag score, ranked by finish order; everyone
 * else gets nothing. 40s.
 */
export class ClimbMinigame implements IMinigame {
  readonly id = "climb";
  readonly name = "Tower Climb";
  readonly maxDuration = 40;

  private map: MinigameMap = climbMap();
  private colliders: RAPIER.Collider[] = [];
  private readonly platforms: ClimbStep[] = climbPlatforms();
  private readonly summit = climbSummit();
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
      this.climbers.set(id, { finished: false, checkpoint: { ...s } });
    });
  }

  update(ctx: MinigameContext, dt: number): void {
    this.elapsed += dt;
    const t = this.elapsed;

    for (const id of ctx.players()) {
      const sim = ctx.sims.get(id);
      const c = this.climbers.get(id);
      if (!sim || !c) continue;
      const p = sim.position;

      // Bank a checkpoint on the platform under the player.
      const step = this.stepUnder(p.x, p.y, p.z);
      if (step) c.checkpoint = { x: p.x, y: step.y + 0.8, z: p.z };

      if (!c.finished && sim.bumperCooldown <= 0) {
        // Rotating bars (jump over to clear).
        for (const s of this.map.sweepers ?? []) {
          if (p.y > s.y + s.thickness / 2 + 0.5) continue;
          const hit = sweeperHit(s, t, p.x, p.z, PHYS.capsuleRadius);
          if (hit.hit) {
            sim.applyKnockback(hit.nx, hit.nz, SWEEP_KNOCK);
            break;
          }
        }
      }
      if (!c.finished && sim.bumperCooldown <= 0) {
        // Spike rollers.
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
      if (!c.finished && sim.bumperCooldown <= 0) {
        // Launched balls shove players along the ball's travel direction.
        for (const l of this.map.launchers ?? []) {
          const ball = launcherBall(l, t);
          if (!ball || Math.abs(p.y - ball.y) > 1.3) continue;
          if (Math.hypot(p.x - ball.x, p.z - ball.z) <= l.ballR + PHYS.capsuleRadius + 0.3) {
            sim.applyKnockback(l.dx, l.dz, BALL_KNOCK);
            break;
          }
        }
      }

      if (p.y < this.map.killY) {
        sim.respawn(c.checkpoint);
        continue;
      }

      if (!c.finished && p.y >= CLIMB_FINISH_Y - 0.4 && this.onSummit(p.x, p.z)) {
        c.finished = true;
        ctx.setScore(id, FINISH_BASE - this.finishOrder);
        this.finishOrder += 1;
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

  /** Route-aware climbing bot: head to the next waypoint, jump bars/balls. */
  botPlan(id: string, ctx: MinigameContext): BotPlan {
    const sim = ctx.sims.get(id);
    if (!sim) return { tx: 0, tz: 0 };
    const p = sim.position;
    const route = ctx.botIndex(id) % 2 === 0 ? CLIMB_ROUTES.easy : CLIMB_ROUTES.hard;
    let target: ClimbStep = this.summit;
    for (const s of route) {
      if (s.y > p.y + 0.4) {
        target = s;
        break;
      }
    }

    // Hop sweeper bars / launched balls that are right on top of us.
    let jump = false;
    const t = this.elapsed;
    for (const s of this.map.sweepers ?? []) {
      if (p.y > s.y + 1.0) continue;
      if (sweeperHit(s, t, p.x, p.z, 1.3).hit) jump = true;
    }
    for (const l of this.map.launchers ?? []) {
      const ball = launcherBall(l, t);
      if (ball && Math.abs(p.y - ball.y) < 1.3 && Math.hypot(p.x - ball.x, p.z - ball.z) < 2.2) {
        jump = true;
      }
    }

    return { tx: target.x, tz: target.z, jump };
  }

  private stepUnder(x: number, y: number, z: number): ClimbStep | null {
    for (const s of this.platforms) {
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

  private onSummit(x: number, z: number): boolean {
    const s = this.summit;
    return Math.abs(x - s.x) <= s.w / 2 + 0.5 && Math.abs(z - s.z) <= s.d / 2 + 0.5;
  }
}
