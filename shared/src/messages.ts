// Client <-> server message contracts.
// Phase 1 placeholder: the real input/state messages are defined in Phase 3
// when the authoritative Colyseus room is introduced. Kept minimal so the
// package compiles and consumers can start importing the namespace early.

/** Input intent the client will send to the server (server-authoritative). */
export interface InputIntent {
  /** Movement axis, camera-relative, each component in [-1, 1]. */
  moveX: number;
  moveZ: number;
  jump: boolean;
  dive: boolean;
  /** Client tick the input was sampled on, for reconciliation. */
  seq: number;
}

/** Authoritative transform broadcast for a single player. */
export interface PlayerTransform {
  id: string;
  x: number;
  y: number;
  z: number;
  /** Facing yaw in radians. */
  yaw: number;
}
