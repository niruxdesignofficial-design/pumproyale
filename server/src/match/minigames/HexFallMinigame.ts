import RAPIER from "@dimforge/rapier3d-compat";
import { ARENA, HEX, hexTilePositions } from "@party-royale/shared";
import type { IMinigame, MinigameContext, MinigameType } from "../IMinigame";

/**
 * Hex Fall (Hex-A-Gone style): the solid floor is replaced by a grid of tiles.
 * A tile starts dissolving the moment a player stands on it and vanishes a beat
 * later; fall through a gap and you are out. Keep moving to survive. The base
 * platform is disabled for this round so falls go to the void.
 */
export class HexFallMinigame implements IMinigame {
  readonly id = "hexfall";
  readonly name = "Hex Fall";
  readonly type: MinigameType = "survival";
  readonly maxDuration = 50;

  private readonly positions = hexTilePositions();
  private colliders: Array<RAPIER.Collider | null> = [];
  private timers: number[] = [];

  setup(ctx: MinigameContext): void {
    ctx.state.minigame = this.name;
    ctx.setPlatformEnabled(false);

    const world = ctx.physics.world;
    this.colliders = this.positions.map((pos) =>
      world.createCollider(
        RAPIER.ColliderDesc.cylinder(HEX.tileHeight / 2, HEX.tileRadius).setTranslation(
          pos.x,
          -HEX.tileHeight / 2,
          pos.z,
        ),
      ),
    );
    this.timers = this.positions.map(() => Infinity);

    ctx.state.tiles.clear();
    for (let i = 0; i < this.positions.length; i++) ctx.state.tiles.push(true);

    const count = this.positions.length;
    const ids = ctx.aliveIds();
    ids.forEach((id, i) => {
      const idx = Math.min(count - 1, Math.floor(((i + 0.5) / ids.length) * count));
      const pos = this.positions[idx]!;
      ctx.sims.get(id)?.respawn({ x: pos.x, y: 2, z: pos.z });
    });
  }

  update(ctx: MinigameContext, dt: number): void {
    // Players touching a tile start its dissolve timer.
    for (const id of ctx.aliveIds()) {
      const sim = ctx.sims.get(id);
      if (!sim) continue;
      const p = sim.position;
      if (p.y < ARENA.fallY) {
        ctx.eliminate(id, "fell");
        continue;
      }
      if (p.y > 1.5) continue; // airborne, not standing on a tile
      const i = this.tileUnder(p.x, p.z);
      if (i >= 0 && this.timers[i] === Infinity) this.timers[i] = HEX.removeDelay;
    }

    // Advance dissolve timers and remove expired tiles.
    for (let i = 0; i < this.timers.length; i++) {
      const timer = this.timers[i]!;
      if (timer === Infinity || this.colliders[i] === null) continue;
      const next = timer - dt;
      this.timers[i] = next;
      if (next <= 0) {
        ctx.physics.world.removeCollider(this.colliders[i]!, false);
        this.colliders[i] = null;
        ctx.state.tiles[i] = false;
      }
    }
  }

  isComplete(ctx: MinigameContext): boolean {
    return ctx.aliveIds().length <= ctx.survivorsTarget();
  }

  teardown(ctx: MinigameContext): void {
    for (const c of this.colliders) if (c) ctx.physics.world.removeCollider(c, false);
    this.colliders = [];
    this.timers = [];
    ctx.state.tiles.clear();
    ctx.setPlatformEnabled(true);
  }

  private tileUnder(x: number, z: number): number {
    let best = -1;
    let bestD = HEX.tileRadius * HEX.tileRadius;
    for (let i = 0; i < this.positions.length; i++) {
      if (this.colliders[i] === null) continue;
      const pos = this.positions[i]!;
      const dx = x - pos.x;
      const dz = z - pos.z;
      const d = dx * dx + dz * dz;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }
}
