import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { allMapProps, type PropAnchor } from "@party-royale/shared";

// Loader/cache for the KayKit Mini-Game Variety Pack props. Every prop is a
// self-contained .glb under /assets/variety. Maps reference props by basename;
// the entire set the maps use is preloaded so building a map is synchronous.

const loader = new GLTFLoader();
const cache = new Map<string, THREE.Object3D | null>();
let preloaded: Promise<void> | null = null;

export function preloadVarietyProps(): Promise<void> {
  if (!preloaded) preloaded = doPreload();
  return preloaded;
}

async function doPreload(): Promise<void> {
  await Promise.all(
    allMapProps().map((name) =>
      loader.loadAsync(`/assets/variety/${name}.gltf.glb`).then(
        (g) => {
          g.scene.traverse((o) => {
            const mesh = o as THREE.Mesh;
            if (mesh.isMesh) {
              mesh.castShadow = true;
              mesh.receiveShadow = true;
            }
          });
          cache.set(name, g.scene);
        },
        (err) => {
          console.warn("[variety] load failed", name, err);
          cache.set(name, null);
        },
      ),
    ),
  );
}

/**
 * A fresh clone of a prop, normalized so its largest horizontal dimension equals
 * `size` (world units) and its `anchor` point sits at the group origin. The
 * caller positions/rotates the returned group. Returns null if the prop failed
 * to load.
 */
export function makeProp(
  name: string,
  size = 2,
  anchor: PropAnchor = "bottom",
): THREE.Object3D | null {
  const template = cache.get(name);
  if (!template) return null;

  const obj = template.clone(true);
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const horiz = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) || 1;
  const scale = size / horiz;
  obj.scale.setScalar(scale);

  const cx = ((box.min.x + box.max.x) / 2) * scale;
  const cz = ((box.min.z + box.max.z) / 2) * scale;
  obj.position.x = -cx;
  obj.position.z = -cz;
  if (anchor === "bottom") obj.position.y = -box.min.y * scale;
  else if (anchor === "top") obj.position.y = -box.max.y * scale;
  else obj.position.y = -((box.min.y + box.max.y) / 2) * scale;

  const wrapper = new THREE.Group();
  wrapper.add(obj);
  return wrapper;
}

export function hasProp(name: string): boolean {
  return Boolean(cache.get(name));
}
