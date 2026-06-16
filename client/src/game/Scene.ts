import * as THREE from "three";

/**
 * Builds the static environment for Phase 1: lighting, a shadow-receiving
 * ground plane with a subtle grid, and light fog for depth. Later phases swap
 * the ground for real KayKit map geometry via the MapRegistry.
 */
export function createScene(): THREE.Scene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x10131a);
  scene.fog = new THREE.Fog(0x10131a, 25, 70);

  // Ambient sky/ground fill.
  const hemi = new THREE.HemisphereLight(0xbfd4ff, 0x39402f, 0.9);
  hemi.position.set(0, 20, 0);
  scene.add(hemi);

  // Key light, casts shadows.
  const sun = new THREE.DirectionalLight(0xfff2e0, 2.2);
  sun.position.set(8, 14, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 50;
  sun.shadow.camera.left = -15;
  sun.shadow.camera.right = 15;
  sun.shadow.camera.top = 15;
  sun.shadow.camera.bottom = -15;
  sun.shadow.bias = -0.0004;
  scene.add(sun);

  // Ground plane.
  const groundMat = new THREE.MeshStandardMaterial({
    color: 0x3a4a5a,
    roughness: 0.95,
    metalness: 0.0,
  });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Subtle grid for spatial reference.
  const grid = new THREE.GridHelper(80, 80, 0x55617a, 0x2a3344);
  const gridMat = grid.material as THREE.Material;
  gridMat.transparent = true;
  gridMat.opacity = 0.35;
  scene.add(grid);

  return scene;
}
