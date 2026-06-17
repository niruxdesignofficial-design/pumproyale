import * as THREE from "three";

/**
 * A bright, cheerful gradient sky dome with a few soft cloud puffs. Cheap, no
 * textures. Pairs with fog set to the horizon color so map edges melt into the
 * sky. Returns the dome and a clouds group plus the colors for fog/background.
 */
export function createSky(): {
  mesh: THREE.Mesh;
  clouds: THREE.Group;
  horizon: THREE.Color;
  top: THREE.Color;
} {
  const top = new THREE.Color(0x4aa6f0); // bright sky blue
  const horizon = new THREE.Color(0xc7ecff); // pale bright near the ground

  const geometry = new THREE.SphereGeometry(380, 32, 16);
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      topColor: { value: top },
      horizonColor: { value: horizon },
      offset: { value: 20 },
      exponent: { value: 0.65 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorldPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 topColor;
      uniform vec3 horizonColor;
      uniform float offset;
      uniform float exponent;
      varying vec3 vWorldPos;
      void main() {
        float h = normalize(vWorldPos + vec3(0.0, offset, 0.0)).y;
        float t = pow(clamp(h, 0.0, 1.0), exponent);
        gl_FragColor = vec4(mix(horizonColor, topColor, t), 1.0);
      }
    `,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "sky";

  const clouds = makeClouds();
  return { mesh, clouds, horizon, top };
}

function makeClouds(): THREE.Group {
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.9,
    fog: false,
  });
  const rng = mulberry32(1337);
  for (let i = 0; i < 9; i++) {
    const cloud = new THREE.Group();
    const blobs = 3 + Math.floor(rng() * 3);
    for (let b = 0; b < blobs; b++) {
      const s = 6 + rng() * 7;
      const sphere = new THREE.Mesh(new THREE.SphereGeometry(s, 12, 10), mat);
      sphere.position.set((rng() - 0.5) * 18, (rng() - 0.5) * 3, (rng() - 0.5) * 10);
      sphere.scale.y = 0.55;
      cloud.add(sphere);
    }
    const angle = rng() * Math.PI * 2;
    const dist = 120 + rng() * 120;
    cloud.position.set(Math.cos(angle) * dist, 40 + rng() * 40, Math.sin(angle) * dist);
    group.add(cloud);
  }
  return group;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
