import * as THREE from "three";
import { CANDY } from "@party-royale/shared";
import { ARENA_HALF } from "@engine/pumpdash/PumpDashSim";

/**
 * Builds the PumpDash square arena: a thick base platform, a lighter play
 * surface, glowing corner posts, and neon edge strips. Reuses the soft-lit look
 * from the scene. Returns a group the game adds to the scene and disposes.
 */
export function buildArena(): THREE.Group {
  const group = new THREE.Group();
  const H = ARENA_HALF;
  const span = H * 2;

  const base = new THREE.Mesh(
    new THREE.BoxGeometry(span + 3, 1.2, span + 3),
    new THREE.MeshStandardMaterial({ color: CANDY.floorB, roughness: 0.9, metalness: 0 }),
  );
  base.position.y = -0.6;
  base.receiveShadow = true;
  group.add(base);

  const field = new THREE.Mesh(
    new THREE.BoxGeometry(span, 0.2, span),
    new THREE.MeshStandardMaterial({ color: CANDY.floorA, roughness: 0.6, metalness: 0.05 }),
  );
  field.position.y = 0.01;
  field.receiveShadow = true;
  group.add(field);

  // Center ring decal.
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.0, 2.3, 48),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.13;
  group.add(ring);

  // Neon edge strips (cosmetic; the goal line is open so the ball passes over).
  const edgeMat = new THREE.MeshStandardMaterial({
    color: 0x49e6c0,
    emissive: 0x1f8f78,
    emissiveIntensity: 0.8,
    roughness: 0.5,
  });
  const edges: [number, number, number, number][] = [
    [0, -H, span, 0.4], // top
    [0, H, span, 0.4], // bottom
    [-H, 0, 0.4, span], // left
    [H, 0, 0.4, span], // right
  ];
  for (const [x, z, sx, sz] of edges) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.3, sz), edgeMat);
    strip.position.set(x, 0.16, z);
    group.add(strip);
  }

  // Corner posts.
  const postMat = new THREE.MeshStandardMaterial({
    color: 0x6fe3c4,
    emissive: 0x1f8f78,
    emissiveIntensity: 0.5,
    roughness: 0.6,
  });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, 1.7, 16), postMat);
      post.position.set(sx * H, 0.85, sz * H);
      post.castShadow = true;
      group.add(post);
    }
  }

  return group;
}

/** A glossy ball mesh for the PumpDash ball entity. */
export function makeBall(radius: number): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 24, 18),
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x9fe9ff,
      emissiveIntensity: 0.25,
      roughness: 0.25,
      metalness: 0.1,
    }),
  );
  mesh.castShadow = true;
  return mesh;
}
