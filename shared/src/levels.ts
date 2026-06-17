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

/** A big round bumper that bounces players outward. */
export interface MapBumper {
  x: number;
  z: number;
  radius: number;
}

export interface GameMap {
  boxes: MapBox[];
  sweepers: MapSweeper[];
  bumpers: MapBumper[];
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

/** Wide, bright race with a few GIANT spinning bars to jump, big bumpers, a
 * bounce pad, and a clear finish. Low side walls keep you on the track. */
export function beamRunMap(): GameMap {
  const half = 6;
  const z0 = -18;
  const z1 = 18;
  const cz = (z0 + z1) / 2;
  const len = z1 - z0;
  return {
    boxes: [
      { type: "floor", cx: 0, cy: -0.4, cz, w: half * 2, h: 0.8, d: len },
      { type: "wall", cx: -half - 0.4, cy: 0.7, cz, w: 0.8, h: 1.4, d: len },
      { type: "wall", cx: half + 0.4, cy: 0.7, cz, w: 0.8, h: 1.4, d: len },
    ],
    // Big low bars: full-width ones must be jumped; the partial one is dodged.
    sweepers: [
      { cx: 0, cz: -8, y: 1.1, reach: 6.2, thickness: 1.4, speed: 1.2, phase: 0 },
      { cx: 0, cz: 2, y: 1.1, reach: 4.6, thickness: 1.3, speed: -1.6, phase: 1.2 },
      { cx: 0, cz: 11, y: 1.1, reach: 6.2, thickness: 1.4, speed: 1.5, phase: 2.2 },
    ],
    bumpers: [
      { x: -3, z: -3, radius: 1.5 },
      { x: 3, z: 6.5, radius: 1.5 },
    ],
    springs: [{ x: 0, z: -13, y: 0, power: 12, r: 1.4 }],
    decos: [],
    spawns: [
      { x: -3.5, y: SPAWN_Y, z: -16 },
      { x: -1.2, y: SPAWN_Y, z: -16 },
      { x: 1.2, y: SPAWN_Y, z: -16 },
      { x: 3.5, y: SPAWN_Y, z: -16 },
    ],
    checkpoints: [-16, -4, 7],
    finishZ: 16,
    crown: null,
    killY: -8,
  };
}

/** Short gauntlet to a pedestal crown; first to touch it wins. (Not in the
 * default rotation, kept for variety.) */
export function crownGrabMap(): GameMap {
  return {
    boxes: [
      { type: "floor", cx: 0, cy: -0.4, cz: 6, w: 9, h: 0.8, d: 32 },
      { type: "wall", cx: -4.9, cy: 0.7, cz: 6, w: 0.8, h: 1.4, d: 32 },
      { type: "wall", cx: 4.9, cy: 0.7, cz: 6, w: 0.8, h: 1.4, d: 32 },
      { type: "platform", cx: 0, cy: 0.5, cz: 18, w: 3.5, h: 1, d: 3.5 },
    ],
    sweepers: [
      { cx: 0, cz: 0, y: 1.1, reach: 4.7, thickness: 1.3, speed: 1.8, phase: 0 },
      { cx: 0, cz: 10, y: 1.1, reach: 4.7, thickness: 1.3, speed: -2.0, phase: 1.5 },
    ],
    bumpers: [],
    springs: [{ x: 0, z: 5, y: 0, power: 12, r: 1.3 }],
    decos: [{ prop: "crown", x: 0, y: 1.4, z: 18, rot: 0, scale: 1.6 }],
    spawns: [
      { x: -3, y: SPAWN_Y, z: -8 },
      { x: -1, y: SPAWN_Y, z: -8 },
      { x: 1, y: SPAWN_Y, z: -8 },
      { x: 3, y: SPAWN_Y, z: -8 },
    ],
    checkpoints: [],
    finishZ: null,
    crown: { x: 0, y: 1.7, z: 18 },
    killY: -8,
  };
}

// --- Sinking Island tiles ----------------------------------------------------

export const ISLAND = { cols: 9, rows: 9, tile: 2.0, thickness: 0.5 };

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
  cols: 8,
  rows: 8,
  spacing: 2.7,
  tileRadius: 1.45,
  tileHeight: 0.5,
  removeDelay: 0.9,
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
