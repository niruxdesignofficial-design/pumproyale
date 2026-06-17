import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { sweeperAngle, type GameMap, type MapSweeper } from "@party-royale/shared";

// Platformer props used to build the maps.
const PROP_URLS: Record<string, string> = {
  floor: "/assets/platformer/neutral/floor_wood_4x4.gltf",
  platform: "/assets/platformer/neutral/platform_wood_1x1x1.gltf",
  spring: "/assets/platformer/neutral/spring.gltf",
  signage_finish_wide: "/assets/platformer/neutral/signage_finish_wide.gltf",
  flag: "/assets/platformer/blue/flag_A_blue.gltf",
  crown: "/assets/props/star.glb",
};

const loader = new GLTFLoader();
const cache = new Map<string, GLTF | null>();
let preloaded: Promise<void> | null = null;

export function preloadProps(): Promise<void> {
  if (!preloaded) {
    preloaded = Promise.all(
      Object.entries(PROP_URLS).map(([key, url]) =>
        loader.loadAsync(url).then(
          (g) => cache.set(key, g),
          (err) => {
            console.warn("[map] prop load failed", url, err);
            cache.set(key, null);
          },
        ),
      ),
    ).then(() => undefined);
  }
  return preloaded;
}

function cloneProp(key: string): THREE.Object3D | null {
  const gltf = cache.get(key);
  if (!gltf) return null;
  const obj = gltf.scene.clone(true);
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
  return obj;
}

/** Fit a prop clone into a target box (center + size), stretching to fit. */
function fitProp(key: string, size: THREE.Vector3, center: THREE.Vector3): THREE.Object3D | null {
  const obj = cloneProp(key);
  if (!obj) return null;
  const bbox = new THREE.Box3().setFromObject(obj);
  const s = new THREE.Vector3();
  const c = new THREE.Vector3();
  bbox.getSize(s);
  bbox.getCenter(c);
  obj.position.sub(c);
  const wrapper = new THREE.Group();
  wrapper.add(obj);
  wrapper.scale.set(size.x / (s.x || 1), size.y / (s.y || 1), size.z / (s.z || 1));
  wrapper.position.copy(center);
  return wrapper;
}

/** Place a prop at a position, scaled, with its base sitting at y. */
function placeProp(key: string, x: number, y: number, z: number, scale = 1, rotY = 0): THREE.Object3D | null {
  const obj = cloneProp(key);
  if (!obj) return null;
  const bbox = new THREE.Box3().setFromObject(obj);
  obj.position.x -= (bbox.min.x + bbox.max.x) / 2;
  obj.position.z -= (bbox.min.z + bbox.max.z) / 2;
  obj.position.y -= bbox.min.y; // base at 0
  const wrapper = new THREE.Group();
  wrapper.add(obj);
  wrapper.scale.setScalar(scale);
  wrapper.position.set(x, y, z);
  wrapper.rotation.y = rotY;
  return wrapper;
}

export interface BuiltMap {
  group: THREE.Group;
  sweepers: { mesh: THREE.Object3D; def: MapSweeper }[];
}

const FLOOR_CELL = 4;

/** Build the visual group for a map from real props; returns sweepers for animation. */
export function buildMapView(map: GameMap): BuiltMap {
  const group = new THREE.Group();
  const sweepers: { mesh: THREE.Object3D; def: MapSweeper }[] = [];

  for (const b of map.boxes) {
    const center = new THREE.Vector3(b.cx, b.cy, b.cz);
    if (b.type === "floor") {
      addTiledFloor(group, b.w, b.h, b.d, center);
    } else {
      const node = fitProp("platform", new THREE.Vector3(b.w, b.h, b.d), center);
      if (node) group.add(node);
    }
  }

  for (const s of map.springs) {
    const node = placeProp("spring", s.x, s.y, s.z, 1);
    if (node) group.add(node);
  }

  for (const d of map.decos) {
    const node = placeProp(d.prop, d.x, d.y, d.z, d.scale, d.rot);
    if (node) group.add(node);
  }

  for (const def of map.sweepers) {
    const mesh = makeSweeperMesh(def);
    mesh.position.set(def.cx, def.y, def.cz);
    group.add(mesh);
    sweepers.push({ mesh, def });
  }

  return { group, sweepers };
}

function addTiledFloor(
  group: THREE.Group,
  w: number,
  h: number,
  d: number,
  center: THREE.Vector3,
): void {
  const cols = Math.max(1, Math.round(w / FLOOR_CELL));
  const rows = Math.max(1, Math.round(d / FLOOR_CELL));
  const cw = w / cols;
  const cd = d / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = center.x - w / 2 + cw * (c + 0.5);
      const cz = center.z - d / 2 + cd * (r + 0.5);
      const tile = fitProp("floor", new THREE.Vector3(cw, h, d / rows), new THREE.Vector3(cx, center.y, cz));
      if (tile) group.add(tile);
    }
  }
}

function makeSweeperMesh(def: MapSweeper): THREE.Object3D {
  const geo = new THREE.BoxGeometry(def.reach * 2, 0.5, def.thickness);
  const mat = new THREE.MeshStandardMaterial({ color: 0xff6b3d, roughness: 0.5, emissive: 0x331005 });
  const beam = new THREE.Mesh(geo, mat);
  beam.castShadow = true;
  // A short post at the pivot for readability.
  const post = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.2, def.y + 0.5, 10),
    new THREE.MeshStandardMaterial({ color: 0x8a93a6 }),
  );
  post.position.y = -(def.y) / 2;
  const node = new THREE.Group();
  node.add(beam, post);
  return node;
}

/** Animate sweepers from the synced round clock. */
export function updateSweepers(built: BuiltMap, t: number): void {
  for (const s of built.sweepers) {
    s.mesh.rotation.y = -sweeperAngle(s.def, t);
  }
}
