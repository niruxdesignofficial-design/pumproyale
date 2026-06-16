import * as THREE from "three";
import { ARENA } from "@party-royale/shared";

const BUMPER_HEIGHT = 1.4;

/**
 * Builds the static environment from the shared ARENA definition: lighting, the
 * finite platform, a reference grid, the bumper visuals, and fog. The colliders
 * for these live on the server (authoritative); the client only renders them, so
 * client and server geometry stay aligned through the same ARENA constants.
 */
export function createScene(): THREE.Scene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x10131a);
  scene.fog = new THREE.Fog(0x10131a, 30, 90);

  const hemi = new THREE.HemisphereLight(0xbfd4ff, 0x39402f, 0.9);
  hemi.position.set(0, 20, 0);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff2e0, 2.2);
  sun.position.set(8, 16, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 60;
  sun.shadow.camera.left = -20;
  sun.shadow.camera.right = 20;
  sun.shadow.camera.top = 20;
  sun.shadow.camera.bottom = -20;
  sun.shadow.bias = -0.0004;
  scene.add(sun);

  // Finite platform slab (top surface at y = 0).
  const size = ARENA.platformHalf * 2;
  const platform = new THREE.Mesh(
    new THREE.BoxGeometry(size, ARENA.platformThickness, size),
    new THREE.MeshStandardMaterial({ color: 0x3a4a5a, roughness: 0.95 }),
  );
  platform.position.y = -ARENA.platformThickness / 2;
  platform.receiveShadow = true;
  platform.castShadow = true;
  scene.add(platform);

  const grid = new THREE.GridHelper(size, size, 0x55617a, 0x2a3344);
  grid.position.y = 0.01;
  const gridMat = grid.material as THREE.Material;
  gridMat.transparent = true;
  gridMat.opacity = 0.35;
  scene.add(grid);

  // Bumper visuals.
  const bumperMat = new THREE.MeshStandardMaterial({
    color: 0xff5d73,
    roughness: 0.5,
    emissive: 0x220008,
  });
  for (const b of ARENA.bumpers) {
    const bumper = new THREE.Mesh(
      new THREE.CylinderGeometry(b.radius, b.radius, BUMPER_HEIGHT, 24),
      bumperMat,
    );
    bumper.position.set(b.x, BUMPER_HEIGHT / 2, b.z);
    bumper.castShadow = true;
    bumper.receiveShadow = true;
    scene.add(bumper);
  }

  return scene;
}
