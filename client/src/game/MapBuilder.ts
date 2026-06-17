import * as THREE from "three";
import { CANDY, sweeperAngle, type GameMap, type MapSweeper } from "@party-royale/shared";

export interface BuiltMap {
  group: THREE.Group;
  sweepers: { mesh: THREE.Object3D; def: MapSweeper }[];
}

const mat = (color: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0, ...extra });

/**
 * Builds a minigame map from big, bright primitives (Fall Guys style): clean
 * candy-colored platforms, GIANT spinning bars, big bumpers, bounce pads, and a
 * clear finish. No textures, no clutter — everything reads at a glance.
 */
export function buildMapView(map: GameMap): BuiltMap {
  const group = new THREE.Group();
  const sweepers: { mesh: THREE.Object3D; def: MapSweeper }[] = [];

  let laneHalf = 5;
  for (const b of map.boxes) {
    if (b.type === "floor") laneHalf = Math.max(laneHalf, b.w / 2);
    group.add(makeBox(b.w, b.h, b.d, b.cx, b.cy, b.cz, boxColor(b.type)));
  }

  for (const bm of map.bumpers) group.add(makeBumper(bm.x, bm.z, bm.radius));
  for (const s of map.springs) group.add(makePad(s.x, s.z, s.r));

  for (const d of map.decos) {
    if (d.prop === "crown") group.add(makeCrown(d.x, d.y, d.z));
  }

  for (const def of map.sweepers) {
    const m = makeBar(def);
    m.position.set(def.cx, def.y, def.cz);
    group.add(m);
    sweepers.push({ mesh: m, def });
  }

  if (map.finishZ != null) group.add(makeFinish(map.finishZ, laneHalf));

  return { group, sweepers };
}

export function updateSweepers(built: BuiltMap, t: number): void {
  for (const s of built.sweepers) s.mesh.rotation.y = -sweeperAngle(s.def, t);
}

// --- primitives --------------------------------------------------------------

function boxColor(type: "floor" | "platform" | "wall"): number {
  if (type === "wall") return CANDY.floorB;
  if (type === "platform") return CANDY.lemon;
  return CANDY.floorA;
}

function makeBox(w: number, h: number, d: number, cx: number, cy: number, cz: number, color: number) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, { roughness: 0.7 }));
  m.position.set(cx, cy, cz);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** A soft rounded bumper that bounces players. */
function makeBumper(x: number, z: number, radius: number): THREE.Group {
  const g = new THREE.Group();
  const h = 1.5;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, h, 24), mat(CANDY.pink));
  body.position.y = h / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  const cap = new THREE.Mesh(new THREE.SphereGeometry(radius, 24, 14), mat(CANDY.coral));
  cap.position.y = h;
  cap.scale.y = 0.6;
  cap.castShadow = true;
  g.add(body, cap);
  g.position.set(x, 0, z);
  return g;
}

/** A bright bounce pad. */
function makePad(x: number, z: number, radius: number): THREE.Group {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.1, 0.35, 24), mat(CANDY.mint, { emissive: 0x0a3322 }));
  base.position.y = 0.18;
  base.receiveShadow = true;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.7, 0.12, 10, 24), mat(0xffffff));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.38;
  g.add(base, ring);
  g.position.set(x, 0, z);
  return g;
}

/** A giant spinning bar (the obstacle to jump or dodge). */
function makeBar(def: MapSweeper): THREE.Group {
  const node = new THREE.Group();
  const radius = def.thickness * 0.6;
  const length = Math.max(0.2, def.reach * 2 - radius * 2);
  const bar = new THREE.Mesh(
    new THREE.CapsuleGeometry(radius, length, 6, 16),
    mat(CANDY.danger, { roughness: 0.6, emissive: 0x4a0f17, emissiveIntensity: 0.3 }),
  );
  bar.rotation.z = Math.PI / 2; // lie along X
  bar.castShadow = true;
  // White stripes for readability.
  for (const s of [-1, 1]) {
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.02, radius * 1.02, 0.5, 16), mat(0xffffff));
    stripe.rotation.z = Math.PI / 2;
    stripe.position.x = s * def.reach * 0.5;
    node.add(stripe);
  }
  const post = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.34, def.y + 0.6, 14),
    mat(0xeef4fb, { roughness: 0.8 }),
  );
  post.position.y = -(def.y) / 2;
  post.castShadow = true;
  node.add(bar, post);
  return node;
}

/** A clear finish: two posts and a banner over the lane. */
function makeFinish(z: number, laneHalf: number): THREE.Group {
  const g = new THREE.Group();
  const postH = 3.4;
  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, postH, 14), mat(CANDY.lemon));
    post.position.set(s * (laneHalf + 0.3), postH / 2, z);
    post.castShadow = true;
    g.add(post);
  }
  const banner = new THREE.Mesh(
    new THREE.BoxGeometry((laneHalf + 0.6) * 2, 0.9, 0.3),
    mat(CANDY.finish, { emissive: 0x0d3320 }),
  );
  banner.position.set(0, postH - 0.4, z);
  g.add(banner);
  // Checker line on the floor.
  const tiles = Math.max(2, Math.round(laneHalf));
  for (let i = -tiles; i < tiles; i++) {
    const tile = new THREE.Mesh(
      new THREE.BoxGeometry(laneHalf / tiles, 0.06, 0.9),
      mat(i % 2 === 0 ? 0xffffff : 0x222a33),
    );
    tile.position.set((i + 0.5) * (laneHalf / tiles), 0.04, z);
    g.add(tile);
  }
  return g;
}

function makeCrown(x: number, y: number, z: number): THREE.Group {
  const g = new THREE.Group();
  const crown = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.9, 0),
    mat(0xffd24d, { metalness: 0.3, roughness: 0.3, emissive: 0x3a2c00 }),
  );
  crown.castShadow = true;
  g.add(crown);
  g.position.set(x, y, z);
  g.userData.spin = true;
  return g;
}
