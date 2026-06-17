import type RAPIER from "@dimforge/rapier3d-compat";
import { SHOOTING, shootingMap, type MinigameMap } from "@party-royale/shared";
import type { IMinigame, MinigameContext } from "../IMinigame";
import type { EntityState } from "../../rooms/schema";
import { buildMapColliders, removeColliders } from "../mapColliders";

interface Target {
  entity: EntityState;
  spot: number;
  /** Seconds until it reappears after being hit. */
  hidden: number;
}

/**
 * Shooting gallery. Face a target and press the action button to shoot it
 * (forgiving aim cone). Each hit scores a point and the target pops up
 * elsewhere. Most hits when time runs out wins the round.
 */
export class ShootingMinigame implements IMinigame {
  readonly id = "shooting";
  readonly name = "Target Range";
  readonly maxDuration = 40;

  private map: MinigameMap = shootingMap();
  private colliders: RAPIER.Collider[] = [];
  private targets: Target[] = [];
  private readonly cooldown = new Map<string, number>();
  private readonly botShot = new Map<string, number>();
  private elapsed = 0;

  setup(ctx: MinigameContext): void {
    this.elapsed = 0;
    this.cooldown.clear();
    this.botShot.clear();
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
      this.targets.push({ entity, spot, hidden: 0 });
    }

    this.map.spawns.forEach((s, i) => {
      const id = ctx.players()[i];
      if (!id) return;
      const sim = ctx.sims.get(id);
      sim?.respawn(s);
      sim?.setFacing(0, 1); // face the targets (far +z side) by default
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
      if (cd > 0) {
        ctx.consumeAction(id); // drop inputs during cooldown
        continue;
      }
      if (!ctx.consumeAction(id)) continue;
      this.cooldown.set(id, SHOOTING.cooldown);
      this.resolveShot(ctx, id);
    }

    // Respawn anyone who walks off the edge.
    for (const id of ctx.players()) {
      const sim = ctx.sims.get(id);
      if (sim && sim.position.y < this.map.killY) sim.respawn();
    }

    for (const [id, t] of this.botShot) this.botShot.set(id, t - dt);
  }

  private resolveShot(ctx: MinigameContext, id: string): void {
    const sim = ctx.sims.get(id);
    if (!sim) return;
    sim.triggerShoot();
    const p = sim.position;
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
    if (best) {
      ctx.addScore(id, 1);
      best.entity.active = false;
      best.hidden = 0.5;
    }
  }

  private relocate(t: Target): void {
    const used = new Set(this.targets.filter((x) => x !== t).map((x) => x.spot));
    t.spot = this.freeSpot(used);
    const s = SHOOTING.spots[t.spot]!;
    t.entity.x = s.x;
    t.entity.z = s.z;
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

  /** Bots walk toward (and thus face) the nearest visible target so shots land. */
  botTarget(id: string, ctx: MinigameContext): { x: number; z: number } {
    const sim = ctx.sims.get(id);
    if (!sim) return { x: 0, z: 4 };
    let best = { x: 0, z: 4 };
    let bestDist = Infinity;
    for (const t of this.targets) {
      if (t.hidden > 0) continue;
      const d = Math.hypot(t.entity.x - sim.position.x, t.entity.z - sim.position.z);
      if (d < bestDist) {
        bestDist = d;
        best = { x: t.entity.x, z: t.entity.z };
      }
    }
    return best;
  }

  botAction(id: string, _ctx: MinigameContext): boolean {
    if ((this.botShot.get(id) ?? 0) > 0) return false;
    this.botShot.set(id, 0.6 + Math.random() * 0.5);
    return true;
  }
}
