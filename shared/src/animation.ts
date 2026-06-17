// Character animation states and their mapping to KayKit clip names.
// Shared so the client (Phase 1+) and the server (Phase 3+, for state decisions)
// agree on a single vocabulary.

/** Logical animation states the game drives. */
export type AnimationState =
  | "idle"
  | "run"
  | "jump"
  | "fall"
  | "dive"
  | "hit"
  | "win"
  | "lose";

/**
 * Map from logical state to the exact clip name in the shared KayKit Rig_Medium
 * animation set (Rig_Medium_MovementBasic.glb + Rig_Medium_General.glb), which
 * applies to every Adventurer character.
 *
 * A few logical states reuse the closest available clip:
 *   - "fall" -> "Jump_Idle" (airborne loop; no dedicated fall clip)
 *   - "dive" -> "Jump_Full_Long"
 *   - "win"  -> "Interact"  (a celebratory gesture)
 *
 * Character loading also performs a case-insensitive substring match as a
 * resilience fallback, so older rigs (e.g. PrototypePete) still resolve.
 */
export const CLIP_NAMES: Record<AnimationState, string> = {
  idle: "Idle_A",
  run: "Running_A",
  jump: "Jump_Idle",
  fall: "Jump_Idle",
  dive: "Jump_Full_Long",
  hit: "Hit_A",
  win: "Interact",
  lose: "Death_A",
};
