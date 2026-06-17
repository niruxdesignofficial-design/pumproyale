import type RAPIER from "@dimforge/rapier3d-compat";
import { GEMS, gemsMap, type MinigameMap } from "@party-royale/shared";
import type { IMinigame, MinigameContext } from "../IMinigame";
import type { EntityState } from "../../rooms/schema";
import { buildMapColliders, removeColliders } from "../mapColliders";

interface Gem {
  entity: EntityState;
  /** Seconds until it reappears after being collected. */
  hidden: number;
}

const GEM_Y = 0.7;

/**
 * Collect gems. Run over the gems scattered across the arena; each one scores a
 * point and then a new gem appears elsewhere. Most gems when time runs out wins.
 */
export class GemsMinigame implements IMinigame {
  readonly id = "gems";
  readonly name = "Gem Rush";
  readonly maxDuration = 40;

  private map: MinigameMap = gemsMap();
  private colliders: RAPIER.Collider[] = [];
  private gems: Gem[] = [];
  private elapsed = 0;

  setup(ctx: MinigameContext): void {
    this.elapsed = 0;
    this.map = gemsMap();
    ctx.state.minigame = this.name;
    ctx.setPlatformEnabled(false);
    this.colliders = buildMapColliders(ctx.physics, this.map);

    this.gems = [];
    for (let i = 0; i < GEMS.count; i++) {
      const entity = ctx.addEntity("gem", i % GEMS.variants.length);
      const spot = this.randomSpot();
      entity.x = spot.x;
      entity.y = GEM_Y;
      entity.z = spot.z;
      this.gems.push({ entity, hidden: 0 });
    }

    this.map.spawns.forEach((s, i) => {
      const id = ctx.players()[i];
      if (id) ctx.sims.get(id)?.respawn(s);
    });
  }

  update(ctx: MinigameContext, dt: number): void {
    this.elapsed += dt;

    for (const gem of this.gems) {
      if (gem.hidden > 0) {
        gem.hidden -= dt;
        if (gem.hidden <= 0) this.relocate(gem);
        continue;
      }
      for (const id of ctx.players()) {
        const sim = ctx.sims.get(id);
        if (!sim) continue;
        const p = sim.position;
        if (Math.hypot(gem.entity.x - p.x, gem.entity.z - p.z) <= GEMS.pickupR) {
          ctx.addScore(id, 1);
          gem.entity.active = false;
          gem.hidden = GEMS.respawn;
          break;
        }
      }
    }

    for (const id of ctx.players()) {
      const sim = ctx.sims.get(id);
      if (sim && sim.position.y < this.map.killY) sim.respawn();
    }
  }

  private relocate(gem: Gem): void {
    const spot = this.randomSpot();
    gem.entity.x = spot.x;
    gem.entity.z = spot.z;
    gem.entity.active = true;
  }

  private randomSpot(): { x: number; z: number } {
    const r = GEMS.half;
    return { x: (Math.random() * 2 - 1) * r, z: (Math.random() * 2 - 1) * r };
  }

  isComplete(): boolean {
    return this.elapsed >= this.maxDuration;
  }

  teardown(ctx: MinigameContext): void {
    removeColliders(ctx.physics, this.colliders);
    this.colliders = [];
    this.gems = [];
    ctx.setPlatformEnabled(true);
  }

  /** Bots chase the nearest visible gem. */
  botTarget(id: string, ctx: MinigameContext): { x: number; z: number } {
    const sim = ctx.sims.get(id);
    if (!sim) return { x: 0, z: 0 };
    let best = { x: 0, z: 0 };
    let bestDist = Infinity;
    for (const gem of this.gems) {
      if (gem.hidden > 0) continue;
      const d = Math.hypot(gem.entity.x - sim.position.x, gem.entity.z - sim.position.z);
      if (d < bestDist) {
        bestDist = d;
        best = { x: gem.entity.x, z: gem.entity.z };
      }
    }
    return best;
  }
}
