import { DEFAULT_CHARACTER, isValidCharacter } from "@party-royale/shared";

// The character the player picked on the select screen, read by the game when it
// joins a match.
let selected = DEFAULT_CHARACTER;

export function getSelectedCharacter(): string {
  return selected;
}

export function setSelectedCharacter(id: string): void {
  if (isValidCharacter(id)) selected = id;
}
