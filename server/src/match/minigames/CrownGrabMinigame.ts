import type RAPIER from "@dimforge/rapier3d-compat";
import { PHYS, crownGrabMap, sweeperHit, type GameMap } from "@party-royale/shared";
import type { IMinigame, MinigameContext, MinigameType } from "../IMinigame";
import { buildMapColliders, removeColliders } from "../mapColliders";

const CROWN_RADIUS = 2.6;
const SWEEP_KNOCK = 9;

/**
 * Final: a short gauntlet past a guarding sweeper to a pedestal crown. The first
 * player to reach the crown wins instantly (everyone else is eliminated). If the
 * timer runs out, the player closest to the crown wins.
 */
export class CrownGrabMinigame implements IMinigame {
  readonly id = "crowngrab";
  readonly name = "Crown Grab";
  readonly type: MinigameType = "final";
  readonly maxDuration = 40;

  private map: GameMap = crownGrabMap();
  private colliders: RAPIER.Collider[] = [];
  private elapsed = 0;

  setup(ctx: MinigameContext): void {
    this.elapsed = 0;
    this.map = crownGrabMap();
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
    const crown = this.map.crown;

    for (const id of ctx.aliveIds()) {
      const sim = ctx.sims.get(id);
      if (!sim) continue;
      const p = sim.position;

      if (p.y < this.map.killY) {
        sim.respawn();
        continue;
      }

      if (sim.bumperCooldown <= 0) {
        for (const s of this.map.sweepers) {
          const hit = sweeperHit(s, t, p.x, p.z, PHYS.capsuleRadius);
          if (hit.hit) {
            sim.applyKnockback(hit.nx, hit.nz, SWEEP_KNOCK);
            break;
          }
        }
      }

      if (crown && Math.hypot(p.x - crown.x, p.z - crown.z) < CROWN_RADIUS && p.y > 0.6) {
        for (const other of ctx.aliveIds()) if (other !== id) ctx.eliminate(other, "crown taken");
        return;
      }
    }

    // Timeout: closest to the crown wins.
    if (this.elapsed >= this.maxDuration && crown && ctx.aliveIds().length > 1) {
      const ranked = ctx
        .aliveIds()
        .map((id) => {
          const p = ctx.sims.get(id)!.position;
          return { id, d: Math.hypot(p.x - crown.x, p.z - crown.z) };
        })
        .sort((a, b) => a.d - b.d);
      for (const r of ranked.slice(1)) ctx.eliminate(r.id, "timeout");
    }
  }

  isComplete(ctx: MinigameContext): boolean {
    return ctx.aliveIds().length <= 1;
  }

  teardown(ctx: MinigameContext): void {
    removeColliders(ctx.physics, this.colliders);
    this.colliders = [];
    ctx.setPlatformEnabled(true);
  }

  botTarget(): { x: number; z: number } {
    return { x: this.map.crown?.x ?? 0, z: this.map.crown?.z ?? 15 };
  }
}
