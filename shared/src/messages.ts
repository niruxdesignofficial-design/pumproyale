// Client <-> server message contracts.
//
// The client only ever sends INPUT INTENTS. There is deliberately no message
// that sets a position, score, or "I won" flag: the server is authoritative and
// derives all of that from the simulation. This is what makes lying impossible.

/** Colyseus room name for a match. */
export const MATCH_ROOM = "match";

/** Message type the client sends each frame with its sampled input. */
export const INPUT_MESSAGE = "input";

/** Input intent the client sends to the server. moveX/moveZ are a world-space,
 * camera-relative direction computed on the client (the server has no camera). */
export interface InputIntent {
  moveX: number;
  moveZ: number;
  run: boolean;
  jump: boolean;
  dive: boolean;
  /** Client input sequence number, for optional reconciliation. */
  seq: number;
}

/** Options sent on joining a room. */
export interface JoinOptions {
  name?: string;
  /** Verified wallet public key (set from Phase 6 onward). */
  wallet?: string;
}
