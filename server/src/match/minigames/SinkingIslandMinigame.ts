import RAPIER from "@dimforge/rapier3d-compat";
import { ISLAND, ISLAND_MAX_RING, islandTiles, type IslandTile } from "@party-royale/shared";
import type { IMinigame, MinigameContext, MinigameType } from "../IMinigame";

const KILL_Y = -8;
const GRACE = 4;
const RING_INTERVAL = 5;

/**
 * Survival: an island of floor tiles whose outer rings collapse over time,
 * shrinking the safe area toward a single center tile. Fall off and you are out;
 * the last ones standing advance / win.
 */
export class SinkingIslandMinigame implements IMinigame {
  readonly id = "island";
  readonly name = "Sinking Island";
  readonly type: MinigameType = "survival";
  readonly maxDuration = 45;

  private tiles: IslandTile[] = [];
  private colliders: Array<RAPIER.Collider | null> = [];
  private elapsed = 0;

  setup(ctx: MinigameContext): void {
    this.elapsed = 0;
    this.tiles = islandTiles();
    ctx.state.minigame = this.name;
    ctx.setPlatformEnabled(false);

    const world = ctx.physics.world;
    this.colliders = this.tiles.map((tile) =>
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(ISLAND.tile / 2, ISLAND.thickness / 2, ISLAND.tile / 2).setTranslation(
          tile.x,
          -ISLAND.thickness / 2,
          tile.z,
        ),
      ),
    );

    ctx.state.tiles.clear();
    for (let i = 0; i < this.tiles.length; i++) ctx.state.tiles.push(true);

    // Place players on inner tiles.
    const inner = this.tiles
      .map((t, i) => ({ t, i }))
      .filter((e) => e.t.ring <= 1);
    const ids = ctx.aliveIds();
    ids.forEach((id, k) => {
      const slot = inner[k % inner.length]!.t;
      ctx.sims.get(id)?.respawn({ x: slot.x, y: 2, z: slot.z });
    });
  }

  update(ctx: MinigameContext, dt: number): void {
    this.elapsed += dt;

    // Collapse outer rings over time.
    const dropped = this.elapsed <= GRACE ? 0 : Math.floor((this.elapsed - GRACE) / RING_INTERVAL) + 1;
    const keepMaxRing = ISLAND_MAX_RING - Math.min(dropped, ISLAND_MAX_RING);
    for (let i = 0; i < this.tiles.length; i++) {
      if (this.colliders[i] && this.tiles[i]!.ring > keepMaxRing) {
        ctx.physics.world.removeCollider(this.colliders[i]!, false);
        this.colliders[i] = null;
        ctx.state.tiles[i] = false;
      }
    }

    for (const id of ctx.aliveIds()) {
      const sim = ctx.sims.get(id);
      if (!sim) continue;
      if (sim.position.y < KILL_Y) ctx.eliminate(id, "fell");
    }

    if (this.elapsed >= this.maxDuration && ctx.aliveIds().length > ctx.survivorsTarget()) {
      const ranked = ctx
        .aliveIds()
        .map((id) => {
          const p = ctx.sims.get(id)!.position;
          return { id, d: Math.hypot(p.x, p.z) };
        })
        .sort((a, b) => a.d - b.d);
      for (const r of ranked.slice(ctx.survivorsTarget())) ctx.eliminate(r.id, "timeout");
    }
  }

  isComplete(ctx: MinigameContext): boolean {
    return ctx.aliveIds().length <= ctx.survivorsTarget();
  }

  teardown(ctx: MinigameContext): void {
    for (const c of this.colliders) if (c) ctx.physics.world.removeCollider(c, false);
    this.colliders = [];
    ctx.state.tiles.clear();
    ctx.setPlatformEnabled(true);
  }

  botTarget(): { x: number; z: number } {
    return { x: 0, z: 0 };
  }
}
