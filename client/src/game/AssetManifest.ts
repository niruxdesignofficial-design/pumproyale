// Typed asset registry. Game code references assets by key, never by raw path,
// so the asset pipeline (scripts/prepare-assets.mjs) and the renderer stay in
// sync through a single source of truth.
//
// Paths are URLs relative to the Vite public root (client/public). The pipeline
// writes the prepared GLBs into client/public/assets/...

export type AssetKey = "character.animated";

interface AssetEntry {
  /** Public URL the GLTFLoader fetches at runtime. */
  readonly url: string;
  /** Human-readable label for HUD/debugging. */
  readonly label: string;
}

export const ASSET_MANIFEST: Record<AssetKey, AssetEntry> = {
  "character.animated": {
    url: "/assets/characters/animated-character.glb",
    label: "KayKit PrototypePete",
  },
};

export function getAsset(key: AssetKey): AssetEntry {
  return ASSET_MANIFEST[key];
}
