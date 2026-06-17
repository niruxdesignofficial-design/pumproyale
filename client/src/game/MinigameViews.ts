import * as THREE from "three";
import {
  CRUMBLE,
  GEMS,
  type MapLauncher,
  type MapSweeper,
  crumbleTiles,
  footballMap,
  shootingMap,
  climbMap,
  gemsMap,
  lobbyMap,
  launcherBall,
  sweeperAngle,
} from "@party-royale/shared";
import { buildMapView } from "./MapBuilder";
import { makeProp } from "./VarietyProps";

type Active = "none" | "lobby" | "football" | "shooting" | "climb" | "gems";

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
 * Renders the active minigame's static map (Variety props) plus its dynamic
 * layers: rotating sweeper bars (climb), the crumbling tile floor (gem round),
 * and the synced entities (ball / targets / gems). Hides the lobby floor while a
 * minigame is shown.
 */
export class MinigameViews {
  private container = new THREE.Group();
  private active: Active = "none";
  private entityMeshes: (THREE.Object3D | null)[] = [];
  private entityKeys: string[] = [];
  private swipers: { mesh: THREE.Object3D; def: MapSweeper }[] = [];
  private launchers: { mesh: THREE.Object3D; def: MapLauncher }[] = [];
  private tileMeshes: (THREE.Object3D | null)[] = [];
  private falling: boolean[] = [];

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
    this.swipers = [];
    this.launchers = [];
    this.tileMeshes = [];
    this.falling = [];

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
              : next === "lobby"
                ? lobbyMap()
                : null;
    if (map) {
      this.container.add(buildMapView(map));
      for (const s of map.sweepers ?? []) {
        const mesh = makeProp(s.model, s.reach * 2, "center");
        if (!mesh) continue;
        mesh.position.set(s.cx, s.y, s.cz);
        this.container.add(mesh);
        this.swipers.push({ mesh, def: s });
      }
      for (const l of map.launchers ?? []) {
        const mesh = makeProp(l.ballModel, l.ballR * 2, "center");
        if (!mesh) continue;
        mesh.visible = false;
        this.container.add(mesh);
        this.launchers.push({ mesh, def: l });
      }
    }
    if (next === "gems") this.buildCrumble();

    this.scene.add(this.container);
  }

  update(
    dt: number,
    roundClock: number,
    entities: ArrayLike<NetEntity> | undefined,
    tiles: ArrayLike<boolean> | undefined,
  ): void {
    if (this.active === "none") return;

    // Rotating sweeper bars track the synced round clock.
    for (const sw of this.swipers) sw.mesh.rotation.y = -sweeperAngle(sw.def, roundClock);

    // Launched balls roll across the path (deterministic from the round clock).
    for (const lc of this.launchers) {
      const ball = launcherBall(lc.def, roundClock);
      if (ball) {
        lc.mesh.visible = true;
        lc.mesh.position.set(ball.x, ball.y + lc.def.ballR, ball.z);
        lc.mesh.rotation.x += dt * 6;
      } else {
        lc.mesh.visible = false;
      }
    }

    // Crumbling floor: tiles that flipped to dead fall away (telegraphed).
    if (this.active === "gems" && tiles) {
      for (let i = 0; i < this.tileMeshes.length; i++) {
        const mesh = this.tileMeshes[i];
        if (!mesh) continue;
        const alive = i < tiles.length ? Boolean(tiles[i]) : true;
        if (!alive && !this.falling[i] && mesh.visible) this.falling[i] = true;
        if (this.falling[i]) {
          mesh.position.y -= dt * 9;
          mesh.rotation.x += dt * 1.6;
          if (mesh.position.y < -12) mesh.visible = false;
        }
      }
    }

    if (!entities) return;
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
      mesh.position.set(e.x, e.kind === "target" ? 0 : e.y, e.z);
      if (e.kind === "gem") mesh.rotation.y += dt * 1.8;
      else if (e.kind === "ball") mesh.rotation.y += dt * 1.2;
      else if (e.kind === "target") mesh.rotation.y = e.yaw;
    }
  }

  private buildCrumble(): void {
    crumbleTiles().forEach((p, i) => {
      const col = i % CRUMBLE.cols;
      const row = Math.floor(i / CRUMBLE.cols);
      const model = CRUMBLE.models[(col + row) % CRUMBLE.models.length]!;
      const mesh = makeProp(model, CRUMBLE.tileSize, "top");
      if (!mesh) {
        this.tileMeshes[i] = null;
        return;
      }
      mesh.position.set(p.x, 0, p.z);
      this.tileMeshes[i] = mesh;
      this.container.add(mesh);
    });
  }
}

function buildEntity(e: NetEntity): THREE.Object3D | null {
  if (e.kind === "ball") return makeProp("ball_teamRed", 1.1, "center");
  if (e.kind === "target") {
    // A stand plus a bullseye that faces the players (rotated by the entity yaw).
    const g = new THREE.Group();
    const stand = makeProp("targetStand", 1.7, "bottom");
    if (stand) g.add(stand);
    const bull = makeProp("target", 1.5, "center");
    if (bull) {
      bull.position.y = 1.3;
      g.add(bull);
    }
    return g;
  }
  if (e.kind === "gem") {
    const model = GEMS.variants[e.variant % GEMS.variants.length]!;
    return makeProp(model, 1.0, "center");
  }
  return null;
}

function classify(name: string): Active {
  if (name === "lobby") return "lobby";
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
