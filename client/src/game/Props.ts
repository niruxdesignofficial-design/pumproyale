import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

// A small set of KayKit "forest" props used to dress the PumpDash arena diorama.
const NAMES = [
  "tree_forest",
  "rocksA_forest",
  "rocksB_forest",
  "plantA_forest",
  "plantB_forest",
  "detail_forest",
  "tileLarge_forest",
  "tileMedium_forest",
  "tileHigh_forest",
] as const;
export type PropName = (typeof NAMES)[number];

const cache = new Map<string, THREE.Object3D>();
let loaded = false;

/** Load the forest prop set once (shadows enabled). Failures are ignored. */
export async function preloadProps(): Promise<void> {
  if (loaded) return;
  const loader = new GLTFLoader();
  await Promise.all(
    NAMES.map(
      (n) =>
        new Promise<void>((resolve) => {
          loader.load(
            `/assets/variety/${n}.gltf.glb`,
            (gltf) => {
              gltf.scene.traverse((o) => {
                const m = o as THREE.Mesh;
                if (m.isMesh) {
                  m.castShadow = true;
                  m.receiveShadow = true;
                }
              });
              cache.set(n, gltf.scene);
              resolve();
            },
            undefined,
            () => resolve(),
          );
        }),
    ),
  );
  loaded = true;
}

/** A fresh clone of a loaded prop, or null if it failed to load. */
export function getProp(name: PropName): THREE.Object3D | null {
  const src = cache.get(name);
  return src ? src.clone(true) : null;
}
