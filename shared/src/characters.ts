// Playable character roster (KayKit Adventurers, rig Rig_Medium). Pure data so it
// is shared by the client (model loading, select screen) and the server (default
// + validation). Animation clips are shared across all of them.

export interface CharacterDef {
  id: string;
  name: string;
  /** Public URL of the character GLB. */
  file: string;
  /** Accent color (hex) for UI and the player ring. */
  accent: number;
}

export const CHARACTERS: CharacterDef[] = [
  { id: "knight", name: "Knight", file: "/assets/characters/knight.glb", accent: 0x6fb1ff },
  { id: "barbarian", name: "Barbarian", file: "/assets/characters/barbarian.glb", accent: 0xff7a59 },
  { id: "mage", name: "Mage", file: "/assets/characters/mage.glb", accent: 0xb98cff },
  { id: "rogue", name: "Rogue", file: "/assets/characters/rogue.glb", accent: 0x67d98b },
  { id: "ranger", name: "Ranger", file: "/assets/characters/ranger.glb", accent: 0xffd166 },
];

export const CHARACTER_IDS = CHARACTERS.map((c) => c.id);
export const DEFAULT_CHARACTER = "knight";

export function characterById(id: string): CharacterDef {
  return CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0]!;
}

export function isValidCharacter(id: unknown): id is string {
  return typeof id === "string" && CHARACTER_IDS.includes(id);
}
