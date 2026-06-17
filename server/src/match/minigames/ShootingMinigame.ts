import type RAPIER from "@dimforge/rapier3d-compat";
import { SHOOTING, shootingMap, type MinigameMap } from "@party-royale/shared";
import type { BotPlan, IMinigame, MinigameContext } from "../IMinigame";
import type { EntityState } from "../../rooms/schema";
import { buildMapColliders, removeColliders } from "../mapColliders";

interface Target {
  entity: EntityState;
  spot: number;
  /** Seconds until it reappears after being hit. */
  hidden: number;
}

/** Targets sit on the far side and face the shooters (toward -z). */
const TARGET_YAW = Math.PI;
/** Bot accuracy (chance a fired bot shot hits the target it aimed at). */
const BOT_ACCURACY = 0.82;

/**
 * Shooting gallery. Players are sealed in the near zone by a tall barrier and
 * shoot the targets (which face them) on the far side. Hits score; the target
 * pops up elsewhere. Most hits in 40s wins the round.
 */
export class ShootingMinigame implements IMinigame {
  readonly id = "shooting";
  readonly name = "Target Range";
  readonly maxDuration = 40;

  private map: MinigameMap = shootingMap();
  private colliders: RAPIER.Collider[] = [];
  private targets: Target[] = [];
  private readonly cooldown = new Map<string, number>();
  private readonly botFire = new Map<string, number>();
  private elapsed = 0;

  setup(ctx: MinigameContext): void {
    this.elapsed = 0;
    this.cooldown.clear();
    this.botFire.clear();
    this.map = shootingMap();
    ctx.state.minigame = this.name;
    ctx.setPlatformEnabled(false);
    this.colliders = buildMapColliders(ctx.physics, this.map);

    const used = new Set<number>();
    this.targets = [];
    for (let i = 0; i < SHOOTING.targets; i++) {
      const spot = this.freeSpot(used);
      used.add(spot);
      const entity = ctx.addEntity("target", 0);
      const s = SHOOTING.spots[spot]!;
      entity.x = s.x;
      entity.y = SHOOTING.y;
      entity.z = s.z;
      entity.yaw = TARGET_YAW;
      this.targets.push({ entity, spot, hidden: 0 });
    }

    const ids = ctx.players();
    this.map.spawns.forEach((s, i) => {
      const id = ids[i];
      if (!id) return;
      const sim = ctx.sims.get(id);
      sim?.respawn(s);
      sim?.setFacing(0, 1); // face the targets (far +z side)
    });
  }

  update(ctx: MinigameContext, dt: number): void {
    this.elapsed += dt;

    for (const t of this.targets) {
      if (t.hidden > 0) {
        t.hidden -= dt;
        if (t.hidden <= 0) this.relocate(t);
      }
    }

    for (const id of ctx.players()) {
      const cd = (this.cooldown.get(id) ?? 0) - dt;
      this.cooldown.set(id, Math.max(0, cd));
      const isBot = ctx.state.players.get(id)?.isBot ?? false;
      if (cd > 0) {
        ctx.consumeAction(id);
        continue;
      }
      if (!ctx.consumeAction(id)) continue;
      this.cooldown.set(id, SHOOTING.cooldown);
      this.resolveShot(ctx, id, isBot);
    }
  }

  private resolveShot(ctx: MinigameContext, id: string, isBot: boolean): void {
    const sim = ctx.sims.get(id);
    if (!sim) return;
    sim.triggerShoot();
    const p = sim.position;

    if (isBot) {
      // Bots aim straight at the nearest visible target (skill-gated accuracy).
      const t = this.nearestTarget(p.x, p.z);
      if (!t) return;
      sim.setFacing(t.entity.x - p.x, t.entity.z - p.z);
      if (Math.random() < BOT_ACCURACY) this.hit(ctx, id, t);
      return;
    }

    // Humans: forgiving aim cone around their facing direction.
    const f = ctx.facing(id);
    let best: Target | null = null;
    let bestDist = Infinity;
    for (const t of this.targets) {
      if (t.hidden > 0) continue;
      const dx = t.entity.x - p.x;
      const dz = t.entity.z - p.z;
      const dist = Math.hypot(dx, dz);
      if (dist > SHOOTING.range || dist < 0.001) continue;
      const dot = (dx / dist) * f.x + (dz / dist) * f.z;
      if (dot < Math.cos(SHOOTING.cone)) continue;
      if (dist < bestDist) {
        bestDist = dist;
        best = t;
      }
    }
    if (best) this.hit(ctx, id, best);
  }

  private hit(ctx: MinigameContext, id: string, t: Target): void {
    ctx.addScore(id, 1);
    t.entity.active = false;
    t.hidden = 0.5;
  }

  private nearestTarget(x: number, z: number): Target | null {
    let best: Target | null = null;
    let bestDist: number = SHOOTING.range;
    for (const t of this.targets) {
      if (t.hidden > 0) continue;
      const d = Math.hypot(t.entity.x - x, t.entity.z - z);
      if (d < bestDist) {
        bestDist = d;
        best = t;
      }
    }
    return best;
  }

  private relocate(t: Target): void {
    const used = new Set(this.targets.filter((x) => x !== t).map((x) => x.spot));
    t.spot = this.freeSpot(used);
    const s = SHOOTING.spots[t.spot]!;
    t.entity.x = s.x;
    t.entity.z = s.z;
    t.entity.yaw = TARGET_YAW;
    t.entity.active = true;
  }

  private freeSpot(used: Set<number>): number {
    const free: number[] = [];
    for (let i = 0; i < SHOOTING.spots.length; i++) if (!used.has(i)) free.push(i);
    const pool = free.length > 0 ? free : SHOOTING.spots.map((_, i) => i);
    return pool[Math.floor(Math.random() * pool.length)]!;
  }

  isComplete(): boolean {
    return this.elapsed >= this.maxDuration;
  }

  teardown(ctx: MinigameContext): void {
    removeColliders(ctx.physics, this.colliders);
    this.colliders = [];
    this.targets = [];
    ctx.setPlatformEnabled(true);
  }

  /** Bots hold a spread spot in the near zone and fire on a steady cadence. */
  botPlan(id: string, ctx: MinigameContext, dt: number): BotPlan {
    let t = (this.botFire.get(id) ?? 0) - dt;
    let action = false;
    if (t <= 0) {
      action = true;
      t = SHOOTING.cooldown + 0.1 + Math.random() * 0.3;
    }
    this.botFire.set(id, t);
    const idx = ctx.botIndex(id);
    const tx = (idx - 1.5) * 4; // spread along the firing line
    return { tx, tz: -7, action };
  }
}
