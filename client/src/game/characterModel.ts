import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { getAsset } from "./AssetManifest";

let cached: Promise<GLTF | null> | null = null;

/**
 * Loads the rigged KayKit character GLB once and caches it. Avatars clone this
 * shared GLTF (mesh + skeleton) and reuse its animation clips, so N players cost
 * one network fetch. Returns null if the asset is missing (pipeline not run), in
 * which case avatars fall back to a procedural placeholder.
 */
export function loadCharacterGltf(): Promise<GLTF | null> {
  if (!cached) cached = doLoad();
  return cached;
}

async function doLoad(): Promise<GLTF | null> {
  const asset = getAsset("character.animated");
  const loader = new GLTFLoader();

  // DRACO wired but optional; the Phase 1 asset is uncompressed so it never activates.
  const draco = new DRACOLoader();
  draco.setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.7/");
  loader.setDRACOLoader(draco);

  try {
    return await loader.loadAsync(asset.url);
  } catch (err) {
    console.warn(
      "[character] could not load",
      asset.url,
      "- avatars will use a placeholder. Run `pnpm assets:prepare`.",
      err,
    );
    return null;
  }
}
