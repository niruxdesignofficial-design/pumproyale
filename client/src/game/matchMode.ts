import type { PlayMode } from "../net/NetClient";

// How the player chose to enter the next match (quick play, create a private
// room, or join one by code). Set on the menu, read by the game when it joins.
let mode: PlayMode = { kind: "quick" };

export function getPlayMode(): PlayMode {
  return mode;
}

export function setPlayMode(next: PlayMode): void {
  mode = next;
}
