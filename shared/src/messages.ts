// Client <-> server message contracts.
//
// The client only ever sends INPUT INTENTS. There is deliberately no message
// that sets a position, score, or "I won" flag: the server is authoritative and
// derives all of that from the simulation. This is what makes lying impossible.

/** Colyseus room name for a match. */
export const MATCH_ROOM = "match";

/** Message type the client sends each frame with its sampled input. */
export const INPUT_MESSAGE = "input";

/** Message type the client sends to play a quick emote above their avatar. */
export const EMOTE_MESSAGE = "emote";

/** The short, text-only emotes (no emojis) players can trigger with keys 1-4. */
export const EMOTES = ["GG!", "Nice!", "Oops!", "Hi!"] as const;
export type EmoteId = 0 | 1 | 2 | 3;

/** Payload for an emote message: which emote (index into EMOTES). */
export interface EmoteMessage {
  id: number;
}

/** Input intent the client sends to the server. moveX/moveZ are a world-space,
 * camera-relative direction computed on the client (the server has no camera). */
export interface InputIntent {
  moveX: number;
  moveZ: number;
  run: boolean;
  jump: boolean;
  dive: boolean;
  /** Context action button (kick the ball / shoot a target). Edge-detected server-side. */
  action: boolean;
  /** Aim direction on the ground plane (camera forward) for precise shooting/kicking.
   * Defaults to (0,0) when the client doesn't send it; the server falls back to facing. */
  aimX?: number;
  aimZ?: number;
  /** Client input sequence number, for optional reconciliation. */
  seq: number;
}

/** Options sent on joining a room. */
export interface JoinOptions {
  name?: string;
  /** Verified wallet public key (set from Phase 6 onward). */
  wallet?: string;
  /** Chosen character id (see characters.ts). */
  character?: string;
  /** Create a private room (not matched by quick play; joinable only by code). */
  private?: boolean;
}
