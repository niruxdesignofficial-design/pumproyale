import RAPIER from "@dimforge/rapier3d-compat";
import {
  CRUMBLE,
  CRUMBLE_LEDGE,
  GEMS,
  crumbleTiles,
  gemsMap,
  type MinigameMap,
} from "@party-royale/shared";
import type { BotPlan, IMinigame, MinigameContext } from "../IMinigame";
import type { EntityState } from "../../rooms/schema";
import { buildMapColliders, removeColliders } from "../mapColliders";

interface Gem {
  entity: EntityState;
  tile: number;
  /** Seconds until it reappears after being collected. */
  hidden: number;
}

const GEM_Y = 0.7;

/**
 * Gem rush on a crumbling floor. The floor is a grid of tiles that drop a beat
 * after a player stands on them. Gems appear only on live tiles; grab as many as
 * you can before the floor gives way. Fall through and you watch from the ledge
 * (out for the round, not eliminated). Most gems wins.
 */
export class GemsMinigame implements IMinigame {
  readonly id = "gems";
  readonly name = "Gem Rush";
  readonly maxDuration = 45;

  private map: MinigameMap = gemsMap();
  private colliders: RAPIER.Collider[] = [];
  private readonly positions = crumbleTiles();
  private tileColliders: Array<RAPIER.Collider | null> = [];
  private tileTimers: number[] = [];
  private gems: Gem[] = [];
  private readonly out = new Set<string>();
  private elapsed = 0;

  setup(ctx: MinigameContext): void {
    this.elapsed = 0;
    this.out.clear();
    this.map = gemsMap();
    ctx.state.minigame = this.name;
    ctx.setPlatformEnabled(false);
    this.colliders = buildMapColliders(ctx.physics, this.map);

    // The crumbling floor: one collider per tile (sized to tile the plane with no
    // gaps so players cannot slip between tiles), plus a synced liveness flag.
    const world = ctx.physics.world;
    const half = CRUMBLE.spacing / 2;
    this.tileColliders = this.positions.map((p) =>
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(half, CRUMBLE.thickness / 2, half).setTranslation(
          p.x,
          -CRUMBLE.thickness / 2,
          p.z,
        ),
      ),
    );
    this.tileTimers = this.positions.map(() => Infinity);
    ctx.state.tiles.clear();
    for (let i = 0; i < this.positions.length; i++) ctx.state.tiles.push(true);

    // Gems on random live tiles.
    this.gems = [];
    for (let i = 0; i < GEMS.count; i++) {
      const entity = ctx.addEntity("gem", i % GEMS.variants.length);
      const gem: Gem = { entity, tile: -1, hidden: 0 };
      this.placeGem(gem);
      this.gems.push(gem);
    }

    const ids = ctx.players();
    this.map.spawns.forEach((s, i) => {
      const id = ids[i];
      if (id) ctx.sims.get(id)?.respawn(s);
    });
  }

  update(ctx: MinigameContext, dt: number): void {
    this.elapsed += dt;

    // Players standing on a tile start its drop timer; fallers go to the ledge.
    for (const id of ctx.players()) {
      const sim = ctx.sims.get(id);
      if (!sim) continue;
      const p = sim.position;
      if (this.out.has(id)) continue;
      if (p.y < this.map.killY) {
        this.knockOut(ctx, id);
        continue;
      }
      if (p.y < 1.3) {
        const i = this.tileUnder(p.x, p.z);
        if (i >= 0 && this.tileTimers[i] === Infinity) this.tileTimers[i] = CRUMBLE.removeDelay;
      }
    }

    // Advance tile timers and drop expired tiles.
    for (let i = 0; i < this.tileTimers.length; i++) {
      const timer = this.tileTimers[i]!;
      if (timer === Infinity || this.tileColliders[i] === null) continue;
      const next = timer - dt;
      this.tileTimers[i] = next;
      if (next <= 0) {
        ctx.physics.world.removeCollider(this.tileColliders[i]!, false);
        this.tileColliders[i] = null;
        ctx.state.tiles[i] = false;
      }
    }

    // Gems: relocate ones over dead tiles, handle respawns, and collection.
    for (const gem of this.gems) {
      if (gem.hidden > 0) {
        gem.hidden -= dt;
        if (gem.hidden <= 0) this.placeGem(gem);
        continue;
      }
      if (gem.tile >= 0 && this.tileColliders[gem.tile] === null) {
        this.placeGem(gem);
        if (!gem.entity.active) continue;
      }
      for (const id of ctx.players()) {
        if (this.out.has(id)) continue;
        const sim = ctx.sims.get(id);
        if (!sim) continue;
        const pp = sim.position;
        if (Math.hypot(gem.entity.x - pp.x, gem.entity.z - pp.z) <= GEMS.pickupR) {
          ctx.addScore(id, 1);
          gem.entity.active = false;
          gem.hidden = GEMS.respawn;
          break;
        }
      }
    }
  }

  /** Move a gem onto a random live tile (or hide it if the floor is gone). */
  private placeGem(gem: Gem): void {
    const live: number[] = [];
    for (let i = 0; i < this.tileColliders.length; i++) {
      if (this.tileColliders[i] !== null) live.push(i);
    }
    if (live.length === 0) {
      gem.entity.active = false;
      gem.tile = -1;
      return;
    }
    const i = live[Math.floor(Math.random() * live.length)]!;
    const pos = this.positions[i]!;
    gem.tile = i;
    gem.entity.x = pos.x + (Math.random() - 0.5) * 1.2;
    gem.entity.y = GEM_Y;
    gem.entity.z = pos.z + (Math.random() - 0.5) * 1.2;
    gem.entity.active = true;
  }

  /** Send a fallen player to the spectator ledge and freeze their scoring. */
  private knockOut(ctx: MinigameContext, id: string): void {
    this.out.add(id);
    const n = this.out.size - 1;
    const slot = (n - 1.5) * 3; // spread across the ledge width
    ctx.sims.get(id)?.respawn({ x: slot, y: CRUMBLE_LEDGE.y + 1.5, z: CRUMBLE_LEDGE.z });
  }

  private tileUnder(x: number, z: number): number {
    const offX = ((CRUMBLE.cols - 1) * CRUMBLE.spacing) / 2;
    const offZ = ((CRUMBLE.rows - 1) * CRUMBLE.spacing) / 2;
    const col = Math.round((x + offX) / CRUMBLE.spacing);
    const row = Math.round((z + offZ) / CRUMBLE.spacing);
    if (col < 0 || col >= CRUMBLE.cols || row < 0 || row >= CRUMBLE.rows) return -1;
    const i = row * CRUMBLE.cols + col;
    return this.tileColliders[i] === null ? -1 : i;
  }

  isComplete(ctx: MinigameContext): boolean {
    if (this.elapsed >= this.maxDuration) return true;
    const ids = ctx.players();
    return ids.length > 0 && ids.every((id) => this.out.has(id));
  }

  teardown(ctx: MinigameContext): void {
    removeColliders(ctx.physics, this.colliders);
    this.colliders = [];
    for (const c of this.tileColliders) if (c) ctx.physics.world.removeCollider(c, false);
    this.tileColliders = [];
    this.tileTimers = [];
    this.gems = [];
    this.out.clear();
    ctx.state.tiles.clear();
    ctx.setPlatformEnabled(true);
  }

  /**
   * Bots chase the nearest live gem (the controller's edge-avoidance keeps them
   * from walking into the holes left by dropped tiles). Out bots hold still.
   */
  botPlan(id: string, ctx: MinigameContext): BotPlan {
    const sim = ctx.sims.get(id);
    if (!sim || this.out.has(id)) return { tx: sim?.position.x ?? 0, tz: sim?.position.z ?? 0, hold: true };
    let best = { x: sim.position.x, z: sim.position.z };
    let bestDist = Infinity;
    for (const gem of this.gems) {
      if (!gem.entity.active) continue;
      const d = Math.hypot(gem.entity.x - sim.position.x, gem.entity.z - sim.position.z);
      if (d < bestDist) {
        bestDist = d;
        best = { x: gem.entity.x, z: gem.entity.z };
      }
    }
    return { tx: best.x, tz: best.z };
  }
}
