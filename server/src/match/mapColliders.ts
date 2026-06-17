import RAPIER from "@dimforge/rapier3d-compat";
import type { GameMap } from "@party-royale/shared";
import type { PhysicsWorld } from "../physics/PhysicsWorld";

/**
 * Build static colliders for a map's box elements (floors, platforms, walls).
 * Sweepers, springs, finish, and crown are resolved in minigame update logic,
 * not as colliders. Returns the handles so the minigame can remove them.
 */
export function buildMapColliders(physics: PhysicsWorld, map: GameMap): RAPIER.Collider[] {
  const world = physics.world;
  return map.boxes.map((b) =>
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(b.w / 2, b.h / 2, b.d / 2).setTranslation(b.cx, b.cy, b.cz),
    ),
  );
}

export function removeColliders(physics: PhysicsWorld, colliders: RAPIER.Collider[]): void {
  for (const c of colliders) physics.world.removeCollider(c, false);
}
