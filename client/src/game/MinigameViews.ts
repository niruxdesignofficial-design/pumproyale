import * as THREE from "three";
import {
  CANDY,
  ISLAND,
  HEX,
  beamRunMap,
  crownGrabMap,
  hexTilePositions,
  islandTiles,
} from "@party-royale/shared";
import { buildMapView, updateSweepers, type BuiltMap } from "./MapBuilder";

const HEX_COLORS = [CANDY.pink, CANDY.blue, CANDY.mint, CANDY.lemon, CANDY.lavender, CANDY.coral];

type Active = "none" | "beamrun" | "crowngrab" | "hex" | "island";

/**
 * Renders the active minigame's map: real platformer props for Beam Run and
 * Crown Grab (with animated sweeper beams), and tile grids for Hex Fall and
 * Sinking Island driven by the synced tile-liveness array. Removed tiles fall
 * away (telegraphed) instead of vanishing. Hides the lobby floor during a map.
 */
export class MinigameViews {
  private container = new THREE.Group();
  private active: Active = "none";
  private built: BuiltMap | null = null;
  private tileMeshes: THREE.Mesh[] = [];
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
    this.built = null;
    this.tileMeshes = [];
    this.falling = [];

    const lobby = next === "none";
    this.platform.visible = lobby;
    this.grid.visible = lobby;

    if (next === "beamrun") {
      this.built = buildMapView(beamRunMap());
      this.container.add(this.built.group);
    } else if (next === "crowngrab") {
      this.built = buildMapView(crownGrabMap());
      this.container.add(this.built.group);
    } else if (next === "hex") {
      this.buildHex();
    } else if (next === "island") {
      this.buildIsland();
    }

    this.scene.add(this.container);
  }

  update(dt: number, roundClock: number, tiles: ArrayLike<boolean> | undefined): void {
    if (this.built) updateSweepers(this.built, roundClock);
    if ((this.active === "hex" || this.active === "island") && tiles) {
      for (let i = 0; i < this.tileMeshes.length; i++) {
        const mesh = this.tileMeshes[i];
        if (!mesh) continue;
        const alive = i < tiles.length ? Boolean(tiles[i]) : true;
        if (!alive && !this.falling[i] && mesh.visible) this.falling[i] = true;
        if (this.falling[i]) {
          mesh.position.y -= dt * 9;
          mesh.rotation.x += dt * 1.5;
          if (mesh.position.y < -10) mesh.visible = false;
        }
      }
    }
  }

  private buildHex(): void {
    const geo = new THREE.CylinderGeometry(HEX.tileRadius, HEX.tileRadius * 0.94, HEX.tileHeight, 6);
    hexTilePositions().forEach((pos, i) => {
      const color = HEX_COLORS[i % HEX_COLORS.length]!;
      const tile = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.6 }));
      tile.position.set(pos.x, -HEX.tileHeight / 2, pos.z);
      tile.castShadow = true;
      tile.receiveShadow = true;
      this.tileMeshes.push(tile);
      this.container.add(tile);
    });
  }

  private buildIsland(): void {
    const mat = new THREE.MeshStandardMaterial({ color: 0xd8c29a, roughness: 0.95 });
    const center = new THREE.MeshStandardMaterial({ color: 0xc7a778, roughness: 0.95 });
    for (const t of islandTiles()) {
      const tile = new THREE.Mesh(
        new THREE.BoxGeometry(ISLAND.tile * 0.96, ISLAND.thickness, ISLAND.tile * 0.96),
        t.ring === 0 ? center : mat,
      );
      tile.position.set(t.x, -ISLAND.thickness / 2, t.z);
      tile.castShadow = true;
      tile.receiveShadow = true;
      this.tileMeshes.push(tile);
      this.container.add(tile);
    }
  }
}

function classify(name: string): Active {
  if (/beam/i.test(name)) return "beamrun";
  if (/crown/i.test(name)) return "crowngrab";
  if (/hex/i.test(name)) return "hex";
  if (/island|sinking/i.test(name)) return "island";
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
