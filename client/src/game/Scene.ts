import * as THREE from "three";
import { ARENA, CANDY } from "@party-royale/shared";
import { createSky } from "./Sky";

export interface BuiltScene {
  scene: THREE.Scene;
  /** The solid lobby platform mesh (hidden during minigames). */
  platform: THREE.Mesh;
  /** The reference grid (hidden during minigames). */
  grid: THREE.GridHelper;
}

/**
 * Builds the persistent environment with a soft pastel look: a gradient sky dome,
 * horizon-colored fog (so map edges melt into the sky, not black), a faint
 * distant ground, soft high-ambient lighting, and the lobby platform/grid.
 */
export function createScene(): BuiltScene {
  const scene = new THREE.Scene();

  const sky = createSky();
  scene.add(sky.mesh);
  scene.add(sky.clouds);
  // Fallback background (in case the dome is clipped) so the void is never black.
  scene.background = new THREE.Color(0x7cc4f5);
  scene.fog = new THREE.Fog(sky.horizon.getHex(), 60, 320);

  // Faint distant ground so looking over an edge shows soft color, not void.
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(300, 48),
    new THREE.MeshStandardMaterial({ color: 0x8fd6a6, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -18;
  ground.receiveShadow = false;
  scene.add(ground);

  // Soft "clay" lighting: gentle sky/ground fill + one soft key + low ambient lift.
  const hemi = new THREE.HemisphereLight(0xffffff, 0xb9d0c0, 0.7);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xfff4e6, 1.2);
  key.position.set(8, 16, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.radius = 8;
  key.shadow.blurSamples = 16;
  key.shadow.bias = -0.0005;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 70;
  key.shadow.camera.left = -26;
  key.shadow.camera.right = 26;
  key.shadow.camera.top = 26;
  key.shadow.camera.bottom = -26;
  scene.add(key);

  scene.add(new THREE.AmbientLight(0xffffff, 0.16));

  const size = ARENA.platformHalf * 2;
  const platform = new THREE.Mesh(
    new THREE.BoxGeometry(size, ARENA.platformThickness, size),
    new THREE.MeshStandardMaterial({ color: CANDY.floorA, roughness: 0.85, metalness: 0 }),
  );
  platform.position.y = -ARENA.platformThickness / 2;
  platform.receiveShadow = true;
  platform.castShadow = true;
  scene.add(platform);

  const grid = new THREE.GridHelper(size, size, 0xffffff, 0xbfe6ff);
  grid.position.y = 0.02;
  const gridMat = grid.material as THREE.Material;
  gridMat.transparent = true;
  gridMat.opacity = 0.2;
  scene.add(grid);

  return { scene, platform, grid };
}
