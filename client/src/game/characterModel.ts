import type * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { CHARACTERS, characterById } from "@party-royale/shared";

// Shared animation clips (Rig_Medium) that apply to every Adventurer character.
const ANIM_FILES = [
  "/assets/animations/Rig_Medium_MovementBasic.glb",
  "/assets/animations/Rig_Medium_General.glb",
];

const loader = new GLTFLoader();

const characterCache = new Map<string, GLTF | null>();
let clips: THREE.AnimationClip[] = [];
let preloaded: Promise<void> | null = null;

/** Load all characters and the shared clip set once. Safe to call repeatedly. */
export function preloadCharacters(): Promise<void> {
  if (!preloaded) preloaded = doPreload();
  return preloaded;
}

async function doPreload(): Promise<void> {
  const clipResults = await Promise.all(
    ANIM_FILES.map((f) =>
      loader.loadAsync(f).then(
        (g) => g.animations,
        (err) => {
          console.warn("[character] animation load failed", f, err);
          return [] as THREE.AnimationClip[];
        },
      ),
    ),
  );
  clips = clipResults.flat();

  await Promise.all(
    CHARACTERS.map((c) =>
      loader.loadAsync(c.file).then(
        (g) => characterCache.set(c.id, g),
        (err) => {
          console.warn("[character] character load failed", c.file, err);
          characterCache.set(c.id, null);
        },
      ),
    ),
  );
}

/** The loaded GLTF for a character id (null if it failed / not preloaded). */
export function getCharacterGltf(id: string): GLTF | null {
  return characterCache.get(characterById(id).id) ?? null;
}

/** The shared animation clips (empty until preloaded). */
export function getClips(): THREE.AnimationClip[] {
  return clips;
}
