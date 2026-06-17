// Minigame map layouts shared by the authoritative server (colliders + physics)
// and the client (prop visuals). Moving obstacles (sweeper beams) are a function
// of the synced round clock, so client visuals and server hits stay aligned.

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** A static box element: a floor slab, platform, or wall. Center + full size. */
export interface MapBox {
  type: "floor" | "platform" | "wall";
  cx: number;
  cy: number;
  cz: number;
  w: number;
  h: number;
  d: number;
}

/** A horizontal beam rotating around a pivot at height y, sweeping the floor. */
export interface MapSweeper {
  cx: number;
  cz: number;
  y: number;
  reach: number;
  thickness: number;
  /** rad/s. */
  speed: number;
  phase: number;
}

/** A bounce pad: stepping near it launches the player upward. */
export interface MapSpring {
  x: number;
  z: number;
  y: number;
  power: number;
  r: number;
}

/** Decorative or marker prop (finish gate, crown, flags). */
export interface MapDeco {
  prop: string;
  x: number;
  y: number;
  z: number;
  rot: number;
  scale: number;
}

export interface GameMap {
  boxes: MapBox[];
  sweepers: MapSweeper[];
  springs: MapSpring[];
  decos: MapDeco[];
  spawns: Vec3[];
  /** z lines a racer passes to bank a checkpoint (respawn point). */
  checkpoints: number[];
  /** Race finish line z (null for non-race maps). */
  finishZ: number | null;
  /** Crown trigger for Crown Grab (null otherwise). */
  crown: Vec3 | null;
  killY: number;
}

// --- Sweeper geometry (shared by server collision and client rendering) -----

export function sweeperEndpoints(s: MapSweeper, t: number): [number, number, number, number] {
  const a = s.phase + t * s.speed;
  const dx = Math.cos(a) * s.reach;
  const dz = Math.sin(a) * s.reach;
  return [s.cx - dx, s.cz - dz, s.cx + dx, s.cz + dz];
}

export function sweeperAngle(s: MapSweeper, t: number): number {
  return s.phase + t * s.speed;
}

/** Closest distance from (px,pz) to the rotating beam, with radial knockback dir. */
export function sweeperHit(
  s: MapSweeper,
  t: number,
  px: number,
  pz: number,
  pad: number,
): { hit: boolean; nx: number; nz: number } {
  const [ax, az, bx, bz] = sweeperEndpoints(s, t);
  const vx = bx - ax;
  const vz = bz - az;
  const len2 = vx * vx + vz * vz || 1;
  let u = ((px - ax) * vx + (pz - az) * vz) / len2;
  u = Math.max(0, Math.min(1, u));
  const cxp = ax + vx * u;
  const czp = az + vz * u;
  const dist = Math.hypot(px - cxp, pz - czp);
  if (dist > s.thickness / 2 + pad) return { hit: false, nx: 0, nz: 0 };
  // Knock outward from the pivot.
  const ox = px - s.cx;
  const oz = pz - s.cz;
  const ol = Math.hypot(ox, oz) || 1;
  return { hit: true, nx: ox / ol, nz: oz / ol };
}

// --- Maps -------------------------------------------------------------------

const SPAWN_Y = 2;

/** Obstacle race down a beam-swept lane to a finish gate. Side walls keep
 * players on the track; sweepers leave side lanes you can dodge through. */
export function beamRunMap(): GameMap {
  const laneHalf = 4.5;
  const len = 44;
  const cz = 0;
  return {
    boxes: [
      { type: "floor", cx: 0, cy: -0.25, cz, w: laneHalf * 2, h: 0.5, d: len },
      { type: "wall", cx: -laneHalf - 0.2, cy: 0.75, cz, w: 0.4, h: 1.5, d: len },
      { type: "wall", cx: laneHalf + 0.2, cy: 0.75, cz, w: 0.4, h: 1.5, d: len },
    ],
    sweepers: [
      { cx: 0, cz: -8, y: 0.9, reach: 3.3, thickness: 0.7, speed: 1.6, phase: 0 },
      { cx: 0, cz: 6, y: 0.9, reach: 3.3, thickness: 0.7, speed: -1.9, phase: 1.4 },
    ],
    springs: [
      { x: -2.5, z: -2, y: 0, power: 12, r: 1.1 },
      { x: 2.5, z: 12, y: 0, power: 12, r: 1.1 },
    ],
    decos: [
      { prop: "signage_finish_wide", x: 0, y: 0, z: 19, rot: 0, scale: 1 },
      { prop: "flag", x: -5, y: 0, z: 19, rot: 0, scale: 1 },
      { prop: "flag", x: 5, y: 0, z: 19, rot: 0, scale: 1 },
    ],
    spawns: [
      { x: -3, y: SPAWN_Y, z: -19 },
      { x: -1, y: SPAWN_Y, z: -19 },
      { x: 1, y: SPAWN_Y, z: -19 },
      { x: 3, y: SPAWN_Y, z: -19 },
    ],
    checkpoints: [-19, -4, 8],
    finishZ: 17,
    crown: null,
    killY: -8,
  };
}

/** Short gauntlet to a pedestal crown; first to touch it wins. */
export function crownGrabMap(): GameMap {
  return {
    boxes: [
      { type: "floor", cx: 0, cy: -0.25, cz: 5, w: 8, h: 0.5, d: 26 },
      { type: "wall", cx: -4.2, cy: 0.75, cz: 5, w: 0.4, h: 1.5, d: 26 },
      { type: "wall", cx: 4.2, cy: 0.75, cz: 5, w: 0.4, h: 1.5, d: 26 },
      { type: "platform", cx: 0, cy: 0.4, cz: 15, w: 3, h: 0.8, d: 3 },
    ],
    sweepers: [{ cx: 0, cz: 3, y: 0.9, reach: 3.1, thickness: 0.8, speed: 2.1, phase: 0 }],
    springs: [],
    decos: [{ prop: "crown", x: 0, y: 1.2, z: 15, rot: 0, scale: 1.6 }],
    spawns: [
      { x: -3, y: SPAWN_Y, z: -5 },
      { x: -1, y: SPAWN_Y, z: -5 },
      { x: 1, y: SPAWN_Y, z: -5 },
      { x: 3, y: SPAWN_Y, z: -5 },
    ],
    checkpoints: [],
    finishZ: null,
    crown: { x: 0, y: 1.7, z: 15 },
    killY: -8,
  };
}

// --- Sinking Island tiles ----------------------------------------------------

export const ISLAND = { cols: 7, rows: 7, tile: 2.0, thickness: 0.5 };

export interface IslandTile {
  x: number;
  z: number;
  ring: number;
}

/** Grid of floor tiles, each tagged with its ring (0 = center, larger = outer). */
export function islandTiles(): IslandTile[] {
  const out: IslandTile[] = [];
  const midC = (ISLAND.cols - 1) / 2;
  const midR = (ISLAND.rows - 1) / 2;
  for (let r = 0; r < ISLAND.rows; r++) {
    for (let c = 0; c < ISLAND.cols; c++) {
      out.push({
        x: (c - midC) * ISLAND.tile,
        z: (r - midR) * ISLAND.tile,
        ring: Math.max(Math.abs(c - midC), Math.abs(r - midR)),
      });
    }
  }
  return out;
}

export const ISLAND_MAX_RING = Math.floor((Math.max(ISLAND.cols, ISLAND.rows) - 1) / 2);

// --- Hex Fall (unchanged tile mechanic) -------------------------------------

export const HEX = {
  cols: 7,
  rows: 6,
  spacing: 2.15,
  tileRadius: 1.05,
  tileHeight: 0.4,
  removeDelay: 0.7,
};

export function hexTilePositions(): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  const dx = HEX.spacing;
  const dz = HEX.spacing * 0.88;
  const offX = ((HEX.cols - 1) * dx) / 2;
  const offZ = ((HEX.rows - 1) * dz) / 2;
  for (let r = 0; r < HEX.rows; r++) {
    for (let c = 0; c < HEX.cols; c++) {
      const stagger = r % 2 === 0 ? 0 : dx / 2;
      out.push({ x: c * dx + stagger - offX, z: r * dz - offZ });
    }
  }
  return out;
}
