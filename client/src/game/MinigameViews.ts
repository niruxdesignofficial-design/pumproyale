import * as THREE from "three";
import { ISLAND, HEX, beamRunMap, crownGrabMap, hexTilePositions, islandTiles } from "@party-royale/shared";
import { buildMapView, updateSweepers, type BuiltMap } from "./MapBuilder";

type Active = "none" | "beamrun" | "crowngrab" | "hex" | "island";

/**
 * Renders the active minigame's map: real platformer props for Beam Run and
 * Crown Grab (with animated sweeper beams), and tile grids for Hex Fall and
 * Sinking Island driven by the synced tile-liveness array. Hides the lobby floor
 * while a minigame map is up.
 */
export class MinigameViews {
  private container = new THREE.Group();
  private active: Active = "none";
  private built: BuiltMap | null = null;
  private tileMeshes: THREE.Mesh[] = [];

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

  update(roundClock: number, tiles: ArrayLike<boolean> | undefined): void {
    if (this.built) updateSweepers(this.built, roundClock);
    if ((this.active === "hex" || this.active === "island") && tiles) {
      for (let i = 0; i < this.tileMeshes.length; i++) {
        const m = this.tileMeshes[i];
        if (m) m.visible = i < tiles.length ? Boolean(tiles[i]) : true;
      }
    }
  }

  private buildHex(): void {
    const mat = new THREE.MeshStandardMaterial({ color: 0x7a6cff, roughness: 0.6 });
    for (const pos of hexTilePositions()) {
      const tile = new THREE.Mesh(
        new THREE.CylinderGeometry(HEX.tileRadius, HEX.tileRadius, HEX.tileHeight, 6),
        mat,
      );
      tile.position.set(pos.x, -HEX.tileHeight / 2, pos.z);
      tile.castShadow = true;
      tile.receiveShadow = true;
      this.tileMeshes.push(tile);
      this.container.add(tile);
    }
  }

  private buildIsland(): void {
    const mat = new THREE.MeshStandardMaterial({ color: 0x8a6a44, roughness: 0.85 });
    const edge = new THREE.MeshStandardMaterial({ color: 0x6f5436, roughness: 0.9 });
    for (const t of islandTiles()) {
      const tile = new THREE.Mesh(
        new THREE.BoxGeometry(ISLAND.tile * 0.96, ISLAND.thickness, ISLAND.tile * 0.96),
        t.ring === 0 ? edge : mat,
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
