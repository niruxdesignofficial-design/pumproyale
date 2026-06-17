import RAPIER from "@dimforge/rapier3d-compat";
import { yawPitchQuat, type MinigameMap } from "@party-royale/shared";
import type { PhysicsWorld } from "../physics/PhysicsWorld";

/**
 * Build static colliders for a minigame map (floors, walls, platforms, ramps).
 * Goal zones and pickups are resolved in minigame update logic, not as colliders.
 * Returns the handles so the minigame can remove them in teardown.
 */
export function buildMapColliders(physics: PhysicsWorld, map: MinigameMap): RAPIER.Collider[] {
  const world = physics.world;
  return map.colliders.map((c) => {
    const desc = RAPIER.ColliderDesc.cuboid(c.hx, c.hy, c.hz).setTranslation(c.x, c.y, c.z);
    if (c.yaw || c.pitch) desc.setRotation(yawPitchQuat(c.yaw ?? 0, c.pitch ?? 0));
    return world.createCollider(desc);
  });
}

export function removeColliders(physics: PhysicsWorld, colliders: RAPIER.Collider[]): void {
  for (const c of colliders) physics.world.removeCollider(c, false);
}
