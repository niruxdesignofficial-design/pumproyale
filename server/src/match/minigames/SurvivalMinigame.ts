import RAPIER from "@dimforge/rapier3d-compat";
import { ARENA, PHYS, spawnPoint } from "@party-royale/shared";
import type { IMinigame, MinigameContext } from "../IMinigame";

const START_RADIUS = ARENA.platformHalf - 1;
const END_RADIUS = 1.2;
const BUMPER_HEIGHT = 1.4;

/**
 * King-of-the-hill survival: a safe circle shrinks over time and bumpers shove
 * players around. Players outside the circle (or who fall off) are eliminated
 * until the survivors target is met. A time-limit failsafe keeps only the
 * players nearest center, so the round always resolves.
 */
export class SurvivalMinigame implements IMinigame {
  readonly id = "survival";
  readonly name = "Last One Standing";
  readonly maxDuration = 45;

  private elapsed = 0;
  private bumpers: RAPIER.Collider[] = [];

  setup(ctx: MinigameContext): void {
    this.elapsed = 0;
    ctx.state.minigame = this.name;
    ctx.state.zoneRadius = START_RADIUS;
    ctx.setPlatformEnabled(true);

    const world = ctx.physics.world;
    this.bumpers = ARENA.bumpers.map((b) =>
      world.createCollider(
        RAPIER.ColliderDesc.cylinder(BUMPER_HEIGHT / 2, b.radius)
          .setTranslation(b.x, BUMPER_HEIGHT / 2, b.z)
          .setRestitution(0.3),
      ),
    );

    const ids = ctx.aliveIds();
    ids.forEach((id, i) => ctx.sims.get(id)?.respawn(spawnPoint(i, ids.length)));
  }

  update(ctx: MinigameContext, dt: number): void {
    this.elapsed += dt;
    const t = Math.min(1, this.elapsed / this.maxDuration);
    const radius = START_RADIUS + (END_RADIUS - START_RADIUS) * t;
    ctx.state.zoneRadius = radius;

    for (const id of ctx.aliveIds()) {
      const sim = ctx.sims.get(id);
      if (!sim) continue;
      this.resolveBumpers(sim);
      const p = sim.position;
      if (p.y < ARENA.fallY) {
        ctx.eliminate(id, "fell");
        continue;
      }
      if (Math.hypot(p.x, p.z) > radius + PHYS.capsuleRadius) {
        ctx.eliminate(id, "zone");
      }
    }

    if (this.elapsed >= this.maxDuration) {
      const ranked = ctx
        .aliveIds()
        .map((id) => ({ id, d: Math.hypot(ctx.sims.get(id)!.position.x, ctx.sims.get(id)!.position.z) }))
        .sort((a, b) => a.d - b.d);
      for (const r of ranked.slice(ctx.survivorsTarget())) ctx.eliminate(r.id, "timeout");
    }
  }

  isComplete(ctx: MinigameContext): boolean {
    return ctx.aliveIds().length <= ctx.survivorsTarget();
  }

  teardown(ctx: MinigameContext): void {
    ctx.state.zoneRadius = 0;
    for (const c of this.bumpers) ctx.physics.world.removeCollider(c, false);
    this.bumpers = [];
  }

  botTarget(): { x: number; z: number } {
    return { x: 0, z: 0 };
  }

  private resolveBumpers(sim: { position: RAPIER.Vector; bumperCooldown: number; applyKnockback(x: number, z: number, s: number): void }): void {
    if (sim.bumperCooldown > 0) return;
    const p = sim.position;
    for (const b of ARENA.bumpers) {
      const dx = p.x - b.x;
      const dz = p.z - b.z;
      const dist = Math.hypot(dx, dz);
      if (dist <= b.radius + PHYS.capsuleRadius + PHYS.bumperTriggerPad) {
        const inv = dist > 1e-4 ? 1 / dist : 0;
        sim.applyKnockback(inv === 0 ? 1 : dx * inv, inv === 0 ? 0 : dz * inv, PHYS.knockStrength);
        return;
      }
    }
  }
}
