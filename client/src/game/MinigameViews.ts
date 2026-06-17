import * as THREE from "three";
import { GEMS, footballMap, shootingMap, climbMap, gemsMap } from "@party-royale/shared";
import { buildMapView } from "./MapBuilder";
import { makeProp } from "./VarietyProps";

type Active = "none" | "football" | "shooting" | "climb" | "gems";

/** Minimal shape of a synced dynamic entity (ball / target / gem). */
interface NetEntity {
  kind: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  active: boolean;
  variant: number;
}

/**
 * Renders the active minigame's static map (built from Variety props) plus its
 * dynamic entities (soccer ball, shooting targets, gems) at server-authoritative
 * positions. Hides the lobby floor while a minigame is shown.
 */
export class MinigameViews {
  private container = new THREE.Group();
  private active: Active = "none";
  private entityMeshes: (THREE.Object3D | null)[] = [];
  private entityKeys: string[] = [];

  constructor(
    private readonly scene: THREE.Scene,
    private readonly platform: THREE.Mesh,
    private readonly grid: THREE.GridHelper,
  ) {
    scene.add(this.container);
  }

  setMinigame(name: string): void {
    const next = classify(name);
    if (next === this.active) return;
    this.active = next;

    this.scene.remove(this.container);
    disposeGroup(this.container);
    this.container = new THREE.Group();
    this.entityMeshes = [];
    this.entityKeys = [];

    const lobby = next === "none";
    this.platform.visible = lobby;
    this.grid.visible = lobby;

    const map =
      next === "football"
        ? footballMap()
        : next === "shooting"
          ? shootingMap()
          : next === "climb"
            ? climbMap()
            : next === "gems"
              ? gemsMap()
              : null;
    if (map) this.container.add(buildMapView(map));

    this.scene.add(this.container);
  }

  update(dt: number, _roundClock: number, entities: ArrayLike<NetEntity> | undefined): void {
    if (this.active === "none" || !entities) return;
    for (let i = 0; i < entities.length; i++) {
      const e = entities[i];
      if (!e) continue;
      const key = `${e.kind}:${e.variant}`;
      if (this.entityKeys[i] !== key) {
        const old = this.entityMeshes[i];
        if (old) {
          this.container.remove(old);
          disposeGroup(old);
        }
        const mesh = buildEntity(e);
        this.entityMeshes[i] = mesh;
        this.entityKeys[i] = key;
        if (mesh) this.container.add(mesh);
      }
      const mesh = this.entityMeshes[i];
      if (!mesh) continue;
      mesh.visible = e.active;
      // Targets stand on the floor; ball/gems use their authoritative height.
      mesh.position.set(e.x, e.kind === "target" ? 0 : e.y, e.z);
      if (e.kind === "gem") mesh.rotation.y += dt * 1.8;
      else if (e.kind === "ball") mesh.rotation.y += dt * 1.2;
    }
  }
}

function buildEntity(e: NetEntity): THREE.Object3D | null {
  if (e.kind === "ball") return makeProp("ball_teamRed", 1.1, "center");
  if (e.kind === "target") return makeProp("targetStand", 2.2, "bottom");
  if (e.kind === "gem") {
    const model = GEMS.variants[e.variant % GEMS.variants.length]!;
    return makeProp(model, 1.0, "center");
  }
  return null;
}

function classify(name: string): Active {
  if (/soccer|football/i.test(name)) return "football";
  if (/target|range|shoot/i.test(name)) return "shooting";
  if (/climb|tower/i.test(name)) return "climb";
  if (/gem/i.test(name)) return "gems";
  return "none";
}

function disposeGroup(group: THREE.Object3D): void {
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.geometry?.dispose();
      const mat = m.material;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    }
  });
}
