import * as THREE from "three";
import { ARENA_HALF, OBST_R } from "@engine/pumpdash/PumpDashSim";
import { getProp, type PropName } from "./Props";

// Cohesive green / white palette (PumpDash brand).
const COL = {
  grass: 0x86c96a,
  grassDark: 0x6fb858,
  base: 0xeef2ec, // soft off-white arena rim
  field: 0xe6efe4, // play surface
  trim: 0x2fbf6e, // brand green edge accent
  trimHi: 0x7cf0a8, // local-side highlight
  post: 0xf4f7f2, // white corner posts
  postCap: 0x2fbf6e,
};

/**
 * The PumpDash arena placed inside a little forest world: a grass ground, a soft
 * white court with green trim, white corner posts, a raised tile berm, and
 * scattered KayKit trees / rocks / plants. The local player's side trim can be
 * highlighted. Built from primitives + the preloaded forest props.
 */
export class Arena {
  readonly group = new THREE.Group();
  private readonly edges: THREE.Mesh[] = [];
  private readonly edgeMat: THREE.MeshStandardMaterial;
  private readonly edgeHiMat: THREE.MeshStandardMaterial;

  constructor() {
    const H = ARENA_HALF;
    const span = H * 2;

    // Grass ground.
    const grass = new THREE.Mesh(
      new THREE.CircleGeometry(150, 64),
      new THREE.MeshStandardMaterial({ color: COL.grass, roughness: 1 }),
    );
    grass.rotation.x = -Math.PI / 2;
    grass.position.y = -0.05;
    grass.receiveShadow = true;
    this.group.add(grass);

    // Arena base (rim) + play surface.
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(span + 3.4, 1.2, span + 3.4),
      new THREE.MeshStandardMaterial({ color: COL.base, roughness: 0.85 }),
    );
    base.position.y = -0.5;
    base.receiveShadow = true;
    this.group.add(base);

    const field = new THREE.Mesh(
      new THREE.BoxGeometry(span, 0.22, span),
      new THREE.MeshStandardMaterial({ color: COL.field, roughness: 0.7 }),
    );
    field.position.y = 0.02;
    field.receiveShadow = true;
    this.group.add(field);

    // Center ring.
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.0, 2.28, 56),
      new THREE.MeshBasicMaterial({
        color: COL.trim,
        transparent: true,
        opacity: 0.4,
        side: THREE.DoubleSide,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.15;
    this.group.add(ring);

    // Green trim along each edge (the open goal line; cosmetic, low).
    this.edgeMat = new THREE.MeshStandardMaterial({
      color: COL.trim,
      emissive: COL.trim,
      emissiveIntensity: 0.35,
      roughness: 0.5,
    });
    this.edgeHiMat = new THREE.MeshStandardMaterial({
      color: COL.trimHi,
      emissive: COL.trimHi,
      emissiveIntensity: 0.7,
      roughness: 0.45,
    });
    // index: 0 top, 1 bottom, 2 left, 3 right
    const edgeDefs: [number, number, number, number][] = [
      [0, -H, span, 0.45],
      [0, H, span, 0.45],
      [-H, 0, 0.45, span],
      [H, 0, 0.45, span],
    ];
    for (const [x, z, sx, sz] of edgeDefs) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.3, sz), this.edgeMat);
      strip.position.set(x, 0.18, z);
      this.edges.push(strip);
      this.group.add(strip);
    }

    // White corner posts with green caps.
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const post = new THREE.Mesh(
          new THREE.CylinderGeometry(0.5, 0.6, 1.7, 18),
          new THREE.MeshStandardMaterial({ color: COL.post, roughness: 0.6 }),
        );
        post.position.set(sx * H, 0.85, sz * H);
        post.castShadow = true;
        this.group.add(post);
        const cap = new THREE.Mesh(
          new THREE.SphereGeometry(0.55, 16, 12),
          new THREE.MeshStandardMaterial({
            color: COL.postCap,
            emissive: COL.postCap,
            emissiveIntensity: 0.4,
            roughness: 0.5,
          }),
        );
        cap.position.set(sx * H, 1.8, sz * H);
        this.group.add(cap);
      }
    }

    this.scatterProps(H);
  }

  /**
   * Scatter trees, rocks and plants in a wide ring well clear of the court, so
   * the players stay fully visible. A few plants hug the court for a tidy edge.
   */
  private scatterProps(H: number): void {
    const ringStart = H + 6; // keep everything clear of the court + paddles
    const decor: { name: PropName; scale: [number, number]; count: number; spread: number }[] = [
      { name: "tree_forest", scale: [1.6, 2.8], count: 34, spread: 46 },
      { name: "rocksA_forest", scale: [1.1, 1.9], count: 12, spread: 40 },
      { name: "rocksB_forest", scale: [1.1, 1.9], count: 10, spread: 40 },
      { name: "plantA_forest", scale: [1.0, 1.6], count: 16, spread: 38 },
      { name: "plantB_forest", scale: [1.0, 1.6], count: 14, spread: 38 },
    ];
    for (const d of decor) {
      for (let i = 0; i < d.count; i++) {
        const prop = getProp(d.name);
        if (!prop) break;
        const ang = Math.random() * Math.PI * 2;
        const r = ringStart + Math.random() * d.spread;
        prop.position.set(Math.cos(ang) * r, 0, Math.sin(ang) * r);
        prop.scale.setScalar(d.scale[0] + Math.random() * (d.scale[1] - d.scale[0]));
        prop.rotation.y = Math.random() * Math.PI * 2;
        this.group.add(prop);
      }
    }
  }

  /** Highlight one side's trim (the local player's side) in brighter green. */
  highlightSide(side: number): void {
    for (let i = 0; i < this.edges.length; i++) {
      this.edges[i]!.material = i === side ? this.edgeHiMat : this.edgeMat;
    }
  }

  dispose(): void {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.geometry?.dispose?.();
        const mat = m.material;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose?.();
      }
    });
  }
}

/** A glossy ball mesh for the PumpDash ball entity. */
export function makeBall(radius: number): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 28, 20),
    new THREE.MeshStandardMaterial({
      color: 0x32c46e,
      emissive: 0x37d97a,
      emissiveIntensity: 0.45,
      roughness: 0.25,
      metalness: 0.05,
    }),
  );
  mesh.castShadow = true;
  return mesh;
}

/** An obstacle bumper: green/white, with a flat telegraph ring while warning. */
export function makeObstacle(): { mesh: THREE.Group; setSolid(solid: boolean): void } {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(OBST_R, OBST_R * 1.05, 1.1, 22),
    new THREE.MeshStandardMaterial({ color: 0xf4f7f2, roughness: 0.6 }),
  );
  body.position.y = 0.55;
  body.castShadow = true;
  g.add(body);
  const band = new THREE.Mesh(
    new THREE.CylinderGeometry(OBST_R * 1.03, OBST_R * 1.03, 0.34, 22),
    new THREE.MeshStandardMaterial({
      color: 0x2fbf6e,
      emissive: 0x2fbf6e,
      emissiveIntensity: 0.5,
      roughness: 0.5,
    }),
  );
  band.position.y = 0.75;
  g.add(band);
  const tele = new THREE.Mesh(
    new THREE.RingGeometry(OBST_R * 0.6, OBST_R * 1.1, 32),
    new THREE.MeshBasicMaterial({
      color: 0x7cf0a8,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
    }),
  );
  tele.rotation.x = -Math.PI / 2;
  tele.position.y = 0.12;
  g.add(tele);

  const setSolid = (solid: boolean): void => {
    body.visible = solid;
    band.visible = solid;
    tele.visible = !solid;
  };
  setSolid(false);
  return { mesh: g, setSolid };
}
