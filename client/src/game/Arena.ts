import * as THREE from "three";
import { ARENA_HALF, OBST_R } from "@engine/pumpdash/PumpDashSim";
import { getProp, type PropName } from "./Props";

// Cohesive green / white palette (PumpDash brand).
const COL = {
  grass: 0x86c96a,
  base: 0xeef2ec, // soft off-white arena rim
  field: 0xe9f1e6, // play surface
  trim: 0x2fbf6e, // brand green edge accent
  trimHi: 0x7cf0a8, // local-side highlight
  post: 0xf4f7f2, // white corner posts
  postCap: 0x2fbf6e,
};

let blobTex: THREE.Texture | null = null;
function blobTexture(): THREE.Texture {
  if (blobTex) return blobTex;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
  g.addColorStop(0, "rgba(0,0,0,0.45)");
  g.addColorStop(0.6, "rgba(0,0,0,0.22)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  blobTex = new THREE.CanvasTexture(c);
  return blobTex;
}

/** A soft, flat contact-shadow blob (so props/ball never look like they float). */
export function makeBlobShadow(radius: number, opacity = 1): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 2, radius * 2),
    new THREE.MeshBasicMaterial({
      map: blobTexture(),
      transparent: true,
      opacity,
      depthWrite: false,
    }),
  );
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

/**
 * The PumpDash arena placed inside a little forest world: grass ground, a soft
 * white court with green trim, white corner posts, scattered KayKit trees / rocks
 * / plants (each grounded with a contact-shadow blob). The local player's side is
 * highlighted and edges flash on a concede.
 */
export class Arena {
  readonly group = new THREE.Group();
  private readonly edges: THREE.Mesh[] = [];
  private readonly edgeMats: THREE.MeshStandardMaterial[] = [];
  private readonly edgeLocal = [false, false, false, false];
  private readonly edgeFlash = [0, 0, 0, 0];

  constructor() {
    const H = ARENA_HALF;
    const span = H * 2;

    const grass = new THREE.Mesh(
      new THREE.CircleGeometry(160, 64),
      new THREE.MeshStandardMaterial({ color: COL.grass, roughness: 1 }),
    );
    grass.rotation.x = -Math.PI / 2;
    grass.position.y = -0.05;
    grass.receiveShadow = true;
    this.group.add(grass);

    // Soft blend ring so the court edge melts into the grass instead of a hard cut.
    const blend = new THREE.Mesh(
      new THREE.RingGeometry(H + 1.6, H + 5.5, 64),
      new THREE.MeshBasicMaterial({
        color: 0xbfe0b8,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    blend.rotation.x = -Math.PI / 2;
    blend.position.y = -0.04;
    this.group.add(blend);

    const base = new THREE.Mesh(
      new THREE.BoxGeometry(span + 3.4, 1.2, span + 3.4),
      new THREE.MeshStandardMaterial({ color: COL.base, roughness: 0.8, metalness: 0.04 }),
    );
    base.position.y = -0.5;
    base.receiveShadow = true;
    this.group.add(base);

    const field = new THREE.Mesh(
      new THREE.BoxGeometry(span, 0.22, span),
      new THREE.MeshStandardMaterial({ color: COL.field, roughness: 0.5, metalness: 0.08 }),
    );
    field.position.y = 0.02;
    field.receiveShadow = true;
    this.group.add(field);

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

    // Per-edge trim (own material each so one side can highlight / flash). 0 top,1 bottom,2 left,3 right.
    const edgeDefs: [number, number, number, number][] = [
      [0, -H, span, 0.45],
      [0, H, span, 0.45],
      [-H, 0, 0.45, span],
      [H, 0, 0.45, span],
    ];
    for (const [x, z, sx, sz] of edgeDefs) {
      const mat = new THREE.MeshStandardMaterial({
        color: COL.trim,
        emissive: COL.trim,
        emissiveIntensity: 0.35,
        roughness: 0.45,
      });
      const strip = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.3, sz), mat);
      strip.position.set(x, 0.18, z);
      this.edges.push(strip);
      this.edgeMats.push(mat);
      this.group.add(strip);
    }

    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const post = new THREE.Mesh(
          new THREE.CylinderGeometry(0.5, 0.6, 1.7, 18),
          new THREE.MeshStandardMaterial({ color: COL.post, roughness: 0.55, metalness: 0.04 }),
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

  /** Scatter forest props (each grounded with a blob) in a wide ring off the court. */
  private scatterProps(H: number): void {
    const ringStart = H + 6;
    const decor: {
      name: PropName;
      scale: [number, number];
      count: number;
      spread: number;
      blob: number;
    }[] = [
      { name: "tree_forest", scale: [1.5, 3.0], count: 38, spread: 50, blob: 1.4 },
      { name: "rocksA_forest", scale: [1.0, 2.0], count: 14, spread: 44, blob: 1.1 },
      { name: "rocksB_forest", scale: [1.0, 2.0], count: 12, spread: 44, blob: 1.1 },
      { name: "plantA_forest", scale: [0.9, 1.7], count: 20, spread: 42, blob: 0.7 },
      { name: "plantB_forest", scale: [0.9, 1.7], count: 18, spread: 42, blob: 0.7 },
      { name: "detail_forest", scale: [0.9, 1.5], count: 12, spread: 40, blob: 0.7 },
    ];
    for (const d of decor) {
      for (let i = 0; i < d.count; i++) {
        const prop = getProp(d.name);
        if (!prop) break;
        const ang = Math.random() * Math.PI * 2;
        const r = ringStart + Math.random() * d.spread;
        const s = d.scale[0] + Math.random() * (d.scale[1] - d.scale[0]);
        const x = Math.cos(ang) * r;
        const z = Math.sin(ang) * r;
        prop.position.set(x, 0, z);
        prop.scale.setScalar(s);
        prop.rotation.y = Math.random() * Math.PI * 2;
        this.group.add(prop);
        const blob = makeBlobShadow(d.blob * s, 0.8);
        blob.position.set(x, 0.02, z);
        this.group.add(blob);
      }
    }
  }

  /** Highlight one side's trim (the local player's side) in brighter green. */
  highlightSide(side: number): void {
    for (let i = 0; i < this.edgeMats.length; i++) {
      const local = i === side;
      this.edgeLocal[i] = local;
      this.edgeMats[i]!.color.setHex(local ? COL.trimHi : COL.trim);
      this.edgeMats[i]!.emissive.setHex(local ? COL.trimHi : COL.trim);
    }
  }

  /** Pulse an edge (e.g. when that player concedes a point). */
  flashSide(side: number): void {
    if (side >= 0 && side < this.edgeFlash.length) this.edgeFlash[side] = 1;
  }

  update(dt: number): void {
    for (let i = 0; i < this.edgeMats.length; i++) {
      if (this.edgeFlash[i]! > 0) this.edgeFlash[i] = Math.max(0, this.edgeFlash[i]! - dt * 2.2);
      const base = this.edgeLocal[i] ? 0.7 : 0.35;
      this.edgeMats[i]!.emissiveIntensity = base + this.edgeFlash[i]! * 1.4;
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

/** A glossy green ball mesh for the PumpDash ball entity. */
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

/** An obstacle bumper: green/white, grounded, with a flat telegraph ring while warning. */
export function makeObstacle(): { mesh: THREE.Group; setSolid(solid: boolean): void } {
  const g = new THREE.Group();
  const blob = makeBlobShadow(OBST_R * 1.3, 0.85);
  blob.position.y = 0.04;
  g.add(blob);
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(OBST_R, OBST_R * 1.05, 1.1, 22),
    new THREE.MeshStandardMaterial({ color: 0xf4f7f2, roughness: 0.55, metalness: 0.04 }),
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
    blob.visible = solid;
    tele.visible = !solid;
  };
  setSolid(false);
  return { mesh: g, setSolid };
}
