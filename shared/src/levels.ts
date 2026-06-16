// Minigame level layouts shared by the authoritative server (colliders + physics
// motion) and the client (visuals). Moving obstacles are defined by a formula of
// the round clock so both sides stay in sync without streaming every transform;
// only the round clock (and Hex Fall tile state) is synced.
import { ARENA } from "./arena";

// --- Obstacle Race -------------------------------------------------------------

export interface HammerDef {
  /** Pivot position. */
  x: number;
  z: number;
  armLength: number;
  /** Angular speed (rad/s). */
  speed: number;
  phase: number;
}

export interface SawDef {
  z: number;
  x0: number;
  x1: number;
  speed: number;
  phase: number;
  radius: number;
}

export interface ConveyorDef {
  x: number;
  z: number;
  width: number;
  depth: number;
  dirX: number;
  dirZ: number;
  force: number;
}

export const RACE = {
  startZ: -ARENA.platformHalf + 2,
  finishZ: ARENA.platformHalf - 2,
  hammerHeadRadius: 0.85,
  hammerKnock: 15,
  sawKnock: 17,
  hammers: [
    { x: -3.5, z: -3, armLength: 3, speed: 1.7, phase: 0 },
    { x: 3.5, z: 1, armLength: 3, speed: -1.7, phase: Math.PI },
  ] as HammerDef[],
  saws: [{ z: 5.5, x0: -8, x1: 8, speed: 1.3, phase: 0, radius: 1.1 }] as SawDef[],
  conveyors: [
    { x: 0, z: -1, width: 7, depth: 3, dirX: 0, dirZ: -1, force: 4.5 },
  ] as ConveyorDef[],
};

/** Hammer head world position at round time t. */
export function hammerHead(h: HammerDef, t: number): { x: number; z: number } {
  const a = h.phase + t * h.speed;
  return { x: h.x + Math.cos(a) * h.armLength, z: h.z + Math.sin(a) * h.armLength };
}

/** Sawblade world position at round time t. */
export function sawPos(s: SawDef, t: number): { x: number; z: number } {
  const u = (Math.sin(s.phase + t * s.speed) + 1) / 2;
  return { x: s.x0 + (s.x1 - s.x0) * u, z: s.z };
}

// --- Hex Fall ------------------------------------------------------------------

export const HEX = {
  cols: 7,
  rows: 6,
  spacing: 2.15,
  tileRadius: 1.05,
  tileHeight: 0.4,
  /** Seconds a tile survives after a player steps on it. */
  removeDelay: 0.7,
};

/** Deterministic honeycomb tile centers (offset rows), centered on the arena. */
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
