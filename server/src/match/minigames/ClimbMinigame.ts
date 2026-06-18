import type RAPIER from "@dimforge/rapier3d-compat";
import {
  CLIMB_CHECKPOINTS,
  CLIMB_FINISH_Y,
  CLIMB_ROUTES,
  PHYS,
  climbMap,
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
 * Climb to the flag via one of two routes: a long, wide-weaving JUMP course (blue)
 * or a short, gentle but obstacle-packed route (yellow). Only players who reach the
 * win platform score, ranked by finish order; everyone else gets nothing.
 */
export class ClimbMinigame implements IMinigame {
  readonly id = "climb";
  readonly name = "Tower Climb";
  readonly maxDuration = 70;

  private map: MinigameMap = climbMap();
  private colliders: RAPIER.Collider[] = [];
  private readonly summit = climbSummit();
  private readonly climbers = new Map<string, Climber>();
  /** Per-bot progress index along its route (so bots follow the weave reliably). */
  private readonly botProgress = new Map<string, number>();
  private finishOrder = 0;
  private elapsed = 0;

  setup(ctx: MinigameContext): void {
    this.elapsed = 0;
    this.finishOrder = 0;
    this.climbers.clear();
    this.botProgress.clear();
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

      // Bank the highest checkpoint platform the player has reached. A fall sends
      // them back here (a few platforms back), not to the very start.
      const cp = this.checkpointUnder(p.x, p.y, p.z);
      if (cp && cp.y + 1.0 > c.checkpoint.y) c.checkpoint = { x: cp.x, y: cp.y + 1.0, z: cp.z };

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
        const place = this.finishOrder + 1;
        const name = ctx.state.players.get(id)?.name ?? "Someone";
        ctx.setBanner(place === 1 ? `${name} reached the top first!` : `${name} finished #${place}`);
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

  /**
   * Route-aware climbing bot: walk the chosen route waypoint-by-waypoint (advancing
   * progress as it reaches each one, so it follows the weave instead of cutting),
   * and hop sweeper bars / launched balls that are on top of it.
   */
  botPlan(id: string, ctx: MinigameContext): BotPlan {
    const sim = ctx.sims.get(id);
    if (!sim) return { tx: 0, tz: 0 };
    const p = sim.position;
    const route = ctx.botIndex(id) % 2 === 0 ? CLIMB_ROUTES.easy : CLIMB_ROUTES.hard;

    // Advance the progress index once we're on/above a waypoint's level and roughly
    // over it. Generous thresholds so a bot commits forward and never gets tugged
    // back toward the previous waypoint (which caused stalls at the base step).
    let idx = this.botProgress.get(id) ?? 0;
    const cur = route[Math.min(idx, route.length - 1)]!;
    const near = Math.hypot(p.x - cur.x, p.z - cur.z) < 2.6 && p.y >= cur.y - 0.8;
    if (near && idx < route.length - 1) {
      idx += 1;
      this.botProgress.set(id, idx);
    }
    const target = route[Math.min(idx, route.length - 1)]!;

    // Hop continuously toward the next waypoint while climbing — every platform is a
    // step up and/or a gap, so a rhythmic full-speed hop (gated to grounded+cooldown
    // by the controller, with a clean takeoff toward the waypoint) clears them.
    const gap = Math.hypot(target.x - p.x, target.z - p.z);
    let jump = target.y > p.y - 0.4 || gap > 1.3;
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

  /** The checkpoint platform the player is currently standing on, if any. */
  private checkpointUnder(x: number, y: number, z: number): ClimbStep | null {
    for (const s of CLIMB_CHECKPOINTS) {
      if (
        Math.abs(x - s.x) <= s.w / 2 &&
        Math.abs(z - s.z) <= s.d / 2 &&
        Math.abs(y - (s.y + 0.9)) <= 0.9
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
