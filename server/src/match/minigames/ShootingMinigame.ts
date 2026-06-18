import type RAPIER from "@dimforge/rapier3d-compat";
import { SHOOTING, shootingMap, type MinigameMap } from "@party-royale/shared";
import type { BotPlan, IMinigame, MinigameContext } from "../IMinigame";
import type { EntityState } from "../../rooms/schema";
import { buildMapColliders, removeColliders } from "../mapColliders";

/** Targets sit on the far side (-z) and face the shooters (who are at +z). */
const TARGET_YAW = 0;
/** Bot accuracy (chance a fired bot shot hits the target it aimed at). */
const BOT_ACCURACY = 0.8;
/** Combo window: consecutive hits within this many seconds keep the streak alive. */
const COMBO_WINDOW = 2.2;

/**
 * Target variants (drive scoring, hit size, and the client visual):
 *  0 normal  +1 (common)
 *  1 gold    +3 (rarer, smaller — harder to hit, worth more)
 *  2 decoy   -1 (red X — do NOT shoot it)
 */
const TYPE = {
  NORMAL: 0,
  GOLD: 1,
  DECOY: 2,
} as const;
const TYPE_VALUE = [1, 3, -1];
const TYPE_HIT_SCALE = [1, 0.7, 1]; // gold is smaller

interface Target {
  entity: EntityState;
  spot: number;
  variant: number;
  /** Lateral slide velocity (units/s); 0 for static targets. */
  vx: number;
  baseX: number;
  /** Seconds until it reappears after being hit. */
  hidden: number;
}

interface ComboState {
  streak: number;
  timer: number;
}

/**
 * Target Range. Players are sealed in the near zone behind a tall barrier and
 * shoot the targets across the gap. Aim is the camera forward (a center crosshair
 * on the client) and a shot only scores when it actually points at a target —
 * facing the wall is not enough. Gold targets are worth more, red decoys cost a
 * point, some targets slide, and consecutive hits build a combo multiplier. Most
 * points in 40s wins.
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
  private readonly combos = new Map<string, ComboState>();
  private elapsed = 0;

  setup(ctx: MinigameContext): void {
    this.elapsed = 0;
    this.cooldown.clear();
    this.botFire.clear();
    this.combos.clear();
    this.map = shootingMap();
    ctx.state.minigame = this.name;
    ctx.setPlatformEnabled(false);
    this.colliders = buildMapColliders(ctx.physics, this.map);

    const used = new Set<number>();
    this.targets = [];
    for (let i = 0; i < SHOOTING.targets; i++) {
      const spot = this.freeSpot(used);
      used.add(spot);
      const entity = ctx.addEntity("target", TYPE.NORMAL);
      const s = SHOOTING.spots[spot]!;
      entity.x = s.x;
      entity.y = SHOOTING.y;
      entity.z = s.z;
      entity.yaw = TARGET_YAW;
      const t: Target = { entity, spot, variant: TYPE.NORMAL, vx: 0, baseX: s.x, hidden: 0 };
      this.rollType(t);
      this.targets.push(t);
    }

    const ids = ctx.players();
    this.map.spawns.forEach((s, i) => {
      const id = ids[i];
      if (!id) return;
      const sim = ctx.sims.get(id);
      sim?.respawn(s);
      sim?.setFacing(0, -1); // face the targets (far -z side)
      this.combos.set(id, { streak: 0, timer: 0 });
      const p = ctx.state.players.get(id);
      if (p) p.combo = 0;
    });
  }

  update(ctx: MinigameContext, dt: number): void {
    this.elapsed += dt;

    for (const t of this.targets) {
      if (t.hidden > 0) {
        t.hidden -= dt;
        if (t.hidden <= 0) this.relocate(t);
        continue;
      }
      // Sliding targets drift around their spot.
      if (t.vx !== 0) {
        t.entity.x += t.vx * dt;
        if (Math.abs(t.entity.x - t.baseX) > 2.4) t.vx = -t.vx;
        t.entity.x = Math.max(-9.2, Math.min(9.2, t.entity.x));
      }
    }

    // Decay combo windows.
    for (const [id, c] of this.combos) {
      if (c.streak > 0) {
        c.timer -= dt;
        if (c.timer <= 0) {
          c.streak = 0;
          const p = ctx.state.players.get(id);
          if (p) p.combo = 0;
        }
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
      // Bots aim straight at the nearest non-decoy target (skill-gated accuracy).
      const t = this.nearestTarget(p.x, p.z);
      if (!t) return;
      sim.setFacing(t.entity.x - p.x, t.entity.z - p.z);
      if (Math.random() < BOT_ACCURACY) this.hit(ctx, id, t);
      return;
    }

    // Humans: cast a ray from the player along the camera aim and hit the nearest
    // target the ray actually passes through (within the target's hit radius).
    const a = ctx.aim(id);
    let best: Target | null = null;
    let bestAlong = Infinity;
    for (const t of this.targets) {
      if (t.hidden > 0) continue;
      const dx = t.entity.x - p.x;
      const dz = t.entity.z - p.z;
      const along = dx * a.x + dz * a.z; // distance along the aim ray
      if (along <= 0 || along > SHOOTING.range) continue;
      // Perpendicular distance from the target center to the ray.
      const perp = Math.hypot(dx - a.x * along, dz - a.z * along);
      if (perp > SHOOTING.hitRadius * TYPE_HIT_SCALE[t.variant]!) continue;
      if (along < bestAlong) {
        bestAlong = along;
        best = t;
      }
    }
    if (best) this.hit(ctx, id, best);
    else this.breakCombo(ctx, id); // a miss resets the streak
  }

  private hit(ctx: MinigameContext, id: string, t: Target): void {
    const value = TYPE_VALUE[t.variant]!;
    const c = this.combos.get(id) ?? { streak: 0, timer: 0 };

    if (t.variant === TYPE.DECOY) {
      // Shooting a decoy costs a point and breaks the combo.
      ctx.addScore(id, value);
      this.breakCombo(ctx, id);
    } else {
      c.streak += 1;
      c.timer = COMBO_WINDOW;
      this.combos.set(id, c);
      // Every 3rd consecutive hit adds a bonus (capped so it can't snowball).
      const bonus = Math.min(3, Math.floor(c.streak / 3));
      ctx.addScore(id, value + bonus);
      const p = ctx.state.players.get(id);
      if (p) p.combo = c.streak;
    }

    t.entity.active = false;
    t.hidden = 0.5;
  }

  private breakCombo(ctx: MinigameContext, id: string): void {
    const c = this.combos.get(id);
    if (!c || c.streak === 0) return;
    c.streak = 0;
    c.timer = 0;
    const p = ctx.state.players.get(id);
    if (p) p.combo = 0;
  }

  private nearestTarget(x: number, z: number): Target | null {
    let best: Target | null = null;
    let bestDist: number = SHOOTING.range;
    for (const t of this.targets) {
      if (t.hidden > 0 || t.variant === TYPE.DECOY) continue;
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
    t.baseX = s.x;
    this.rollType(t);
    t.entity.active = true;
  }

  /** Assign a fresh type + maybe a slide when a target (re)appears. */
  private rollType(t: Target): void {
    const r = Math.random();
    t.variant = r < 0.16 ? TYPE.GOLD : r < 0.34 ? TYPE.DECOY : TYPE.NORMAL;
    t.entity.variant = t.variant;
    // ~30% of non-decoy targets slide (decoys stay put so they're avoidable).
    t.vx = t.variant !== TYPE.DECOY && Math.random() < 0.3 ? (Math.random() < 0.5 ? -1 : 1) * 2.2 : 0;
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
    for (const id of ctx.players()) {
      const p = ctx.state.players.get(id);
      if (p) p.combo = 0;
    }
    this.combos.clear();
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
    // Spread along the firing line and strafe slowly so bots read as actively
    // playing (lining up shots), not standing idle.
    const tx = (idx - 1.5) * 4 + Math.sin(this.elapsed * 0.9 + idx * 1.7) * 2.2;
    return { tx, tz: 6, action }; // hold the shooter line (near +z), fire on cadence
  }
}
