import * as THREE from "three";
import { ARENA, HEX, RACE, hammerHead, hexTilePositions, sawPos } from "@party-royale/shared";

type Active = "none" | "race" | "hex" | "survival";

/**
 * Renders minigame-specific geometry on the client. The server owns the physics;
 * these visuals are driven by the same shared layouts and the synced round clock
 * (moving obstacles) and tile state (Hex Fall), so what you see lines up with the
 * authoritative hazards. Switches groups based on the active minigame name.
 */
export class MinigameViews {
  private readonly raceGroup = new THREE.Group();
  private readonly hexGroup = new THREE.Group();
  private readonly survivalGroup = new THREE.Group();

  private readonly hammerHeads: THREE.Mesh[] = [];
  private readonly saws: THREE.Mesh[] = [];
  private readonly tiles: THREE.Mesh[] = [];

  private active: Active = "none";

  constructor(
    scene: THREE.Scene,
    private readonly platform: THREE.Mesh,
    private readonly grid: THREE.GridHelper,
  ) {
    this.buildRace();
    this.buildHex();
    this.buildSurvival();
    this.raceGroup.visible = false;
    this.hexGroup.visible = false;
    this.survivalGroup.visible = false;
    scene.add(this.raceGroup, this.hexGroup, this.survivalGroup);
  }

  /** Switch visible obstacle set based on the minigame display name. */
  setMinigame(name: string): void {
    const next: Active = /race/i.test(name)
      ? "race"
      : /hex/i.test(name)
        ? "hex"
        : /standing|survival/i.test(name)
          ? "survival"
          : "none";
    if (next === this.active) return;
    this.active = next;

    this.raceGroup.visible = next === "race";
    this.hexGroup.visible = next === "hex";
    this.survivalGroup.visible = next === "survival";
    // Hex Fall replaces the solid floor with tiles.
    const showFloor = next !== "hex";
    this.platform.visible = showFloor;
    this.grid.visible = showFloor;
  }

  /** Animate moving obstacles (race) and apply tile liveness (hex). */
  update(roundClock: number, tiles: ArrayLike<boolean> | undefined): void {
    if (this.active === "race") {
      RACE.hammers.forEach((h, i) => {
        const head = hammerHead(h, roundClock);
        this.hammerHeads[i]?.position.set(head.x, 1.1, head.z);
      });
      RACE.saws.forEach((s, i) => {
        const pos = sawPos(s, roundClock);
        const saw = this.saws[i];
        if (saw) {
          saw.position.set(pos.x, 0.7, pos.z);
          saw.rotation.y += 0.4;
        }
      });
    } else if (this.active === "hex" && tiles) {
      for (let i = 0; i < this.tiles.length; i++) {
        const mesh = this.tiles[i];
        if (mesh) mesh.visible = i < tiles.length ? Boolean(tiles[i]) : true;
      }
    }
  }

  private buildRace(): void {
    const postMat = new THREE.MeshStandardMaterial({ color: 0x8a93a6, roughness: 0.7 });
    const headMat = new THREE.MeshStandardMaterial({ color: 0xff6b3d, roughness: 0.5 });
    for (const h of RACE.hammers) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 2.4, 12), postMat);
      post.position.set(h.x, 1.2, h.z);
      post.castShadow = true;
      const head = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.2, 1.2), headMat);
      head.castShadow = true;
      this.hammerHeads.push(head);
      this.raceGroup.add(post, head);
    }

    const sawMat = new THREE.MeshStandardMaterial({
      color: 0xc0c6d0,
      metalness: 0.4,
      roughness: 0.4,
    });
    for (const _s of RACE.saws) {
      const saw = new THREE.Mesh(new THREE.CylinderGeometry(_s.radius, _s.radius, 0.18, 20), sawMat);
      saw.rotation.x = Math.PI / 2;
      saw.castShadow = true;
      this.saws.push(saw);
      this.raceGroup.add(saw);
    }

    for (const c of RACE.conveyors) {
      const belt = new THREE.Mesh(
        new THREE.BoxGeometry(c.width, 0.1, c.depth),
        new THREE.MeshStandardMaterial({ color: 0x2f8f6b, roughness: 0.8 }),
      );
      belt.position.set(c.x, 0.06, c.z);
      belt.receiveShadow = true;
      this.raceGroup.add(belt);
    }

    const finish = new THREE.Mesh(
      new THREE.BoxGeometry(ARENA.platformHalf * 2, 0.1, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x6fe06f, emissive: 0x113311 }),
    );
    finish.position.set(0, 0.06, RACE.finishZ);
    this.raceGroup.add(finish);

    const start = new THREE.Mesh(
      new THREE.BoxGeometry(ARENA.platformHalf * 2, 0.1, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x4a90ff, emissive: 0x0a1933 }),
    );
    start.position.set(0, 0.06, RACE.startZ);
    this.raceGroup.add(start);
  }

  private buildHex(): void {
    const mat = new THREE.MeshStandardMaterial({ color: 0x7a6cff, roughness: 0.6 });
    for (const pos of hexTilePositions()) {
      const tile = new THREE.Mesh(
        new THREE.CylinderGeometry(HEX.tileRadius, HEX.tileRadius, HEX.tileHeight, 6),
        mat,
      );
      tile.position.set(pos.x, -HEX.tileHeight / 2, pos.z);
      tile.receiveShadow = true;
      tile.castShadow = true;
      this.tiles.push(tile);
      this.hexGroup.add(tile);
    }
  }

  private buildSurvival(): void {
    const mat = new THREE.MeshStandardMaterial({
      color: 0xff5d73,
      roughness: 0.5,
      emissive: 0x220008,
    });
    const h = 1.4;
    for (const b of ARENA.bumpers) {
      const bumper = new THREE.Mesh(new THREE.CylinderGeometry(b.radius, b.radius, h, 24), mat);
      bumper.position.set(b.x, h / 2, b.z);
      bumper.castShadow = true;
      bumper.receiveShadow = true;
      this.survivalGroup.add(bumper);
    }
  }
}
