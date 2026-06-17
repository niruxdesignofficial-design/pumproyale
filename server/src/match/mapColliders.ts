import RAPIER from "@dimforge/rapier3d-compat";
import type { MinigameMap } from "@party-royale/shared";
import type { PhysicsWorld } from "../physics/PhysicsWorld";

/**
 * Build static colliders for a minigame map (floors, walls, platforms). Goal
 * zones and pickups are resolved in minigame update logic, not as colliders.
 * Returns the handles so the minigame can remove them in teardown.
 */
export function buildMapColliders(physics: PhysicsWorld, map: MinigameMap): RAPIER.Collider[] {
  const world = physics.world;
  return map.colliders.map((c) => {
    const desc = RAPIER.ColliderDesc.cuboid(c.hx, c.hy, c.hz).setTranslation(c.x, c.y, c.z);
    if (c.yaw) {
      const h = c.yaw / 2;
      desc.setRotation({ x: 0, y: Math.sin(h), z: 0, w: Math.cos(h) });
    }
    return world.createCollider(desc);
  });
}

export function removeColliders(physics: PhysicsWorld, colliders: RAPIER.Collider[]): void {
  for (const c of colliders) physics.world.removeCollider(c, false);
}
