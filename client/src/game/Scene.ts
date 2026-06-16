import * as THREE from "three";

/** Half-extent of the square play platform (world units). Edges at +/-this. */
export const PLATFORM_HALF = 12;

/** Platform slab thickness; its top surface sits at y = 0. */
export const PLATFORM_THICKNESS = 1;

/**
 * Builds the static environment: lighting, a finite play platform (so the
 * player can fall off the edge), a reference grid, and fog. The platform is
 * finite by design - Phase 2 acceptance includes falling off the edge.
 *
 * The visual platform is sized from PLATFORM_HALF / PLATFORM_THICKNESS so the
 * Rapier collider built in Game.ts lines up exactly.
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

  // Finite platform slab. Top surface at y = 0.
  const size = PLATFORM_HALF * 2;
  const platformMat = new THREE.MeshStandardMaterial({
    color: 0x3a4a5a,
    roughness: 0.95,
    metalness: 0.0,
  });
  const platform = new THREE.Mesh(
    new THREE.BoxGeometry(size, PLATFORM_THICKNESS, size),
    platformMat,
  );
  platform.position.y = -PLATFORM_THICKNESS / 2;
  platform.receiveShadow = true;
  platform.castShadow = true;
  scene.add(platform);

  // Grid on the platform surface for spatial reference.
  const grid = new THREE.GridHelper(size, size, 0x55617a, 0x2a3344);
  grid.position.y = 0.01;
  const gridMat = grid.material as THREE.Material;
  gridMat.transparent = true;
  gridMat.opacity = 0.35;
  scene.add(grid);

  return scene;
}
