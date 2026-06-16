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
 * Map from logical state to the exact clip name found inside
 * KayKit_AnimatedCharacter_v1.2.glb (verified by parsing the file).
 *
 * The character only ships a subset of named clips, so a few logical states
 * reuse the closest available clip:
 *   - "fall" -> "Hop"   (no dedicated fall clip)
 *   - "dive" -> "Roll"
 *   - "hit"  -> "Block" (no dedicated getting-hit clip)
 *
 * Character loading also performs a case-insensitive substring match as a
 * resilience fallback, so renamed or repacked rigs still resolve.
 */
export const CLIP_NAMES: Record<AnimationState, string> = {
  idle: "Idle",
  run: "Run",
  jump: "Jump",
  fall: "Hop",
  dive: "Roll",
  hit: "Block",
  win: "Cheer",
  lose: "Defeat",
};
