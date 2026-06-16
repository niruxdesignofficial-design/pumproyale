// Arena layout and physics tuning shared by the authoritative server simulation
// and the client (for rendering static geometry and, later, prediction). Keeping
// this in one place guarantees the server colliders and the client visuals line
// up exactly.

export interface BumperDef {
  x: number;
  z: number;
  radius: number;
}

export interface ArenaDef {
  /** Half-extent of the square platform; edges at +/- this. */
  platformHalf: number;
  /** Platform slab thickness; top surface at y = 0. */
  platformThickness: number;
  bumpers: BumperDef[];
  /** Players spawn on a ring of this radius. */
  spawnRadius: number;
  /** Below this Y a player has fallen off. */
  fallY: number;
}

export const ARENA: ArenaDef = {
  platformHalf: 12,
  platformThickness: 1,
  bumpers: [
    { x: 0, z: 0, radius: 1.3 },
    { x: 5.5, z: 4.5, radius: 1 },
    { x: -5.5, z: -4.5, radius: 1 },
    { x: 5.5, z: -4.5, radius: 1 },
  ],
  spawnRadius: 8,
  fallY: -8,
};

/** Character + movement tuning. Used by the server sim; mirrored client-side for prediction. */
export const PHYS = {
  gravity: 24,
  capsuleRadius: 0.3,
  capsuleHalfHeight: 0.5,
  walkSpeed: 5,
  runSpeed: 8.5,
  jumpSpeed: 9.5,
  airControl: 0.12,
  diveSpeed: 12,
  diveUp: 4,
  diveDuration: 0.55,
  knockUp: 5,
  knockStrength: 13,
  knockControlLock: 0.4,
  bumperCooldown: 0.5,
  bumperTriggerPad: 0.45,
} as const;

/** Distance from a capsule's center to its feet. */
export const FOOT_OFFSET = PHYS.capsuleHalfHeight + PHYS.capsuleRadius;

/** Even spawn placement on a ring around the arena center. */
export function spawnPoint(index: number, total: number): { x: number; y: number; z: number } {
  const n = Math.max(total, 1);
  const angle = (index / n) * Math.PI * 2;
  return {
    x: Math.cos(angle) * ARENA.spawnRadius,
    y: 2,
    z: Math.sin(angle) * ARENA.spawnRadius,
  };
}
