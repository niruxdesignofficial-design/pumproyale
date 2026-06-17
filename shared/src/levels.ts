// Minigame map layouts shared by the authoritative server (colliders + scoring
// zones) and the client (Variety Pack prop visuals). Each map is built from:
//   - props:     visual-only KayKit Mini-Game Variety GLBs placed in the world.
//   - colliders: axis-aligned (optionally yaw-rotated) physics cuboids.
//   - goals:     rectangular trigger zones (soccer) checked in minigame logic.
// Props and colliders are intentionally decoupled: colliders define where you can
// stand/collide, props are the dressing that visually matches them.

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Where the prop's reference point sits relative to (x,y,z). */
export type PropAnchor = "bottom" | "top" | "center";

/**
 * A static visual prop: a Mini-Game Variety GLB referenced by basename (no
 * extension). The client normalizes the GLB so its largest horizontal dimension
 * equals `size`, then anchors it at (x,y,z).
 */
export interface MapProp {
  model: string;
  x: number;
  y: number;
  z: number;
  /** Yaw in radians (default 0). */
  yaw?: number;
  /** Target footprint = largest horizontal dimension, world units (default 2). */
  size?: number;
  /** Vertical anchor (default "bottom"). */
  anchor?: PropAnchor;
}

/** A physics collider box (axis aligned, optional yaw), half-extents from center. */
export interface MapCollider {
  x: number;
  y: number;
  z: number;
  hx: number;
  hy: number;
  hz: number;
  yaw?: number;
}

/** A soccer goal trigger zone owned by one player (by spawn index). */
export interface GoalZone {
  /** Index of the owning player (0-3): scoring here does NOT count for them. */
  owner: number;
  /** Team color index used to tint the goal's flag marker. */
  team: number;
  x: number;
  y: number;
  z: number;
  hx: number;
  hy: number;
  hz: number;
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
  /** Variety prop used to render the bar (a swiper). */
  model: string;
}

/** A stationary proximity hazard (spike roller) that knocks players back. */
export interface MapHazard {
  x: number;
  z: number;
  y: number;
  radius: number;
  model: string;
  yaw?: number;
}

export interface MinigameMap {
  id: string;
  props: MapProp[];
  colliders: MapCollider[];
  spawns: Vec3[];
  /** Below this Y a player has fallen off and is respawned (never eliminated). */
  killY: number;
  goals?: GoalZone[];
  /** Rotating bars (climb hazards), simulated from the synced round clock. */
  sweepers?: MapSweeper[];
  /** Stationary proximity hazards (spike rollers). */
  hazards?: MapHazard[];
}

const SPAWN_Y = 2;

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

// --- shared builders --------------------------------------------------------

/** A grid of floor tiles (anchored so their tops sit at y=0). */
function floorTiles(
  model: string | ((col: number, row: number) => string),
  cols: number,
  rows: number,
  tile: number,
): MapProp[] {
  const out: MapProp[] = [];
  const offX = ((cols - 1) * tile) / 2;
  const offZ = ((rows - 1) * tile) / 2;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      out.push({
        model: typeof model === "string" ? model : model(c, r),
        x: c * tile - offX,
        y: 0,
        z: r * tile - offZ,
        size: tile,
        anchor: "top",
      });
    }
  }
  return out;
}

/** A flat floor collider whose top surface is at y=0. */
function floorCollider(hx: number, hz: number): MapCollider {
  return { x: 0, y: -0.5, z: 0, hx, hy: 0.5, hz };
}

/** A line of barrier props with matching wall colliders along x or z. */
function wall(
  axis: "x" | "z",
  fixed: number,
  from: number,
  to: number,
  height: number,
  model: string,
): { props: MapProp[]; colliders: MapCollider[] } {
  const props: MapProp[] = [];
  const length = Math.abs(to - from);
  const step = 4;
  const n = Math.max(1, Math.round(length / step));
  for (let i = 0; i < n; i++) {
    const t = from + ((i + 0.5) / n) * (to - from);
    props.push({
      model,
      x: axis === "x" ? fixed : t,
      y: 0,
      z: axis === "x" ? t : fixed,
      yaw: axis === "x" ? Math.PI / 2 : 0,
      size: step,
      anchor: "bottom",
    });
  }
  const colliders: MapCollider[] = [
    axis === "x"
      ? { x: fixed, y: height / 2, z: (from + to) / 2, hx: 0.4, hy: height / 2, hz: length / 2 }
      : { x: (from + to) / 2, y: height / 2, z: fixed, hx: length / 2, hy: height / 2, hz: 0.4 },
  ];
  return { props, colliders };
}

// --- Soccer -----------------------------------------------------------------

/**
 * 4-way soccer pitch: a square arena with one goal per player on each edge, a
 * dynamic ball, and a TALL invisible perimeter wall (only the goal mouths are
 * open) so the ball can never leave. Each goal is owned by the player who spawns
 * in front of it; scoring in another player's goal scores for the scorer (own
 * goal = nothing). Owner index == goal index == spawn index.
 */
export function footballMap(): MinigameMap {
  const HALF = 10;
  const GOAL_HALF = 3;
  const WALL_H = 3; // tall (mostly invisible above the low barrier props)
  const props: MapProp[] = floorTiles("tileLarge_forest", 5, 5, 4);
  const colliders: MapCollider[] = [floorCollider(HALF, HALF)];

  // Goals: south(0), north(1), west(2), east(3), each opening into the pitch.
  props.push(
    { model: "gateLargeWide_teamBlue", x: 0, y: 0, z: -HALF, yaw: 0, size: 7 },
    { model: "gateLargeWide_teamRed", x: 0, y: 0, z: HALF, yaw: Math.PI, size: 7 },
    { model: "gateLargeWide_teamYellow", x: -HALF, y: 0, z: 0, yaw: Math.PI / 2, size: 7 },
    { model: "gateLargeWide_teamBlue", x: HALF, y: 0, z: 0, yaw: -Math.PI / 2, size: 7 },
  );

  // Tall invisible perimeter: each edge has two wall segments flanking its goal mouth.
  for (const z of [-HALF - 0.4, HALF + 0.4]) {
    for (const seg of [
      [-HALF, -GOAL_HALF],
      [GOAL_HALF, HALF],
    ] as const) {
      const w = wall("z", z, seg[0], seg[1], WALL_H, "barrierLarge");
      props.push(...w.props);
      colliders.push(...w.colliders);
    }
  }
  for (const x of [-HALF - 0.4, HALF + 0.4]) {
    for (const seg of [
      [-HALF, -GOAL_HALF],
      [GOAL_HALF, HALF],
    ] as const) {
      const w = wall("x", x, seg[0], seg[1], WALL_H, "barrierLarge");
      props.push(...w.props);
      colliders.push(...w.colliders);
    }
  }

  return {
    id: "football",
    props,
    colliders,
    spawns: [
      { x: 0, y: SPAWN_Y, z: -6 }, // owner 0 defends south goal
      { x: 0, y: SPAWN_Y, z: 6 }, // owner 1 defends north goal
      { x: -6, y: SPAWN_Y, z: 0 }, // owner 2 defends west goal
      { x: 6, y: SPAWN_Y, z: 0 }, // owner 3 defends east goal
    ],
    killY: -8,
    goals: [
      { owner: 0, team: 0, x: 0, y: 1.2, z: -HALF - 0.9, hx: GOAL_HALF, hy: 1.6, hz: 0.9 },
      { owner: 1, team: 1, x: 0, y: 1.2, z: HALF + 0.9, hx: GOAL_HALF, hy: 1.6, hz: 0.9 },
      { owner: 2, team: 2, x: -HALF - 0.9, y: 1.2, z: 0, hx: 0.9, hy: 1.6, hz: GOAL_HALF },
      { owner: 3, team: 0, x: HALF + 0.9, y: 1.2, z: 0, hx: 0.9, hy: 1.6, hz: GOAL_HALF },
    ],
  };
}

// --- Shooting gallery -------------------------------------------------------

export const SHOOTING = {
  /** Active targets at once. */
  targets: 6,
  /** Max shot range (world units). */
  range: 22,
  /** Aim cone half-angle (radians) — forgiving for keyboard aim. */
  cone: 0.34,
  /** Seconds between shots. */
  cooldown: 0.45,
  /** Candidate target spots (far side of the barrier; targets relocate between them). */
  spots: [
    { x: -8, z: 8 },
    { x: -4, z: 6 },
    { x: 0, z: 9 },
    { x: 4, z: 6 },
    { x: 8, z: 8 },
    { x: -7, z: 3 },
    { x: 7, z: 3 },
    { x: -3, z: 5 },
    { x: 3, z: 5 },
    { x: 0, z: 4 },
  ] as { x: number; z: number }[],
  /** Height of a target's center. */
  y: 1.3,
} as const;

/**
 * Shooting gallery: a desert platform split by a barrier. Players stay in the
 * near zone and shoot the targets that pop up on the far side (shots are aim-cone
 * checks, so they pass over the barrier; the barrier only blocks movement).
 */
export function shootingMap(): MinigameMap {
  const HALF_X = 10;
  const HALF_Z = 10;
  const props: MapProp[] = floorTiles("tileLarge_desert", 5, 5, 4);
  const colliders: MapCollider[] = [floorCollider(HALF_X, HALF_Z)];
  for (const [axis, fixed, from, to] of [
    ["x", -HALF_X - 0.4, -HALF_Z, HALF_Z],
    ["x", HALF_X + 0.4, -HALF_Z, HALF_Z],
    ["z", -HALF_Z - 0.4, -HALF_X, HALF_X],
    ["z", HALF_Z + 0.4, -HALF_X, HALF_X],
  ] as const) {
    const w = wall(axis, fixed, from, to, 1.2, "barrierMedium");
    props.push(...w.props);
    colliders.push(...w.colliders);
  }
  // The dividing barrier between shooters (z < -1) and targets (z > 1).
  const divider = wall("z", -1, -HALF_X, HALF_X, 1.1, "barrierLarge");
  props.push(...divider.props);
  colliders.push(...divider.colliders);
  // Desert dressing.
  props.push(
    { model: "rocksA_desert", x: -9, y: 0, z: 9, size: 2 },
    { model: "tree_desert", x: 9, y: 0, z: 9, size: 3 },
    { model: "plantA_desert", x: -9, y: 0, z: -9, size: 1.4 },
  );
  return {
    id: "shooting",
    props,
    colliders,
    spawns: [
      { x: -6, y: SPAWN_Y, z: -7 },
      { x: -2, y: SPAWN_Y, z: -7 },
      { x: 2, y: SPAWN_Y, z: -7 },
      { x: 6, y: SPAWN_Y, z: -7 },
    ],
    killY: -8,
  };
}

// --- Climb ------------------------------------------------------------------

export interface ClimbStep {
  x: number;
  y: number;
  z: number;
  w: number;
  d: number;
}

/**
 * A long, forgiving staircase rising to a flag: aligned on x=0 so moving forward
 * (and jumping) climbs it, with gentle 1.0-high steps and ~2.8 gaps. The wider
 * "landing" steps host rotating sweeper bars and spike-roller hazards. First to
 * the top scores most.
 */
export const CLIMB_STEPS: ClimbStep[] = [
  { x: 0, y: 0, z: -9, w: 8, d: 4 }, // 0 base
  { x: 0, y: 1, z: -6.2, w: 6, d: 3 }, // 1
  { x: 0, y: 2, z: -3.4, w: 7, d: 4 }, // 2 landing (sweeper)
  { x: 0, y: 3, z: -0.6, w: 6, d: 3 }, // 3
  { x: 0, y: 4, z: 2.2, w: 6, d: 3 }, // 4
  { x: 0, y: 5, z: 5.0, w: 7, d: 4 }, // 5 landing (sweeper)
  { x: 0, y: 6, z: 7.8, w: 6, d: 3 }, // 6
  { x: 0, y: 7, z: 10.6, w: 6, d: 3 }, // 7
  { x: 0, y: 8, z: 13.4, w: 7, d: 4 }, // 8 landing (sweeper + spikes)
  { x: 0, y: 9, z: 16.2, w: 6, d: 3 }, // 9
  { x: 0, y: 10, z: 19.0, w: 6, d: 3 }, // 10 (spikes)
  { x: 0, y: 11, z: 21.8, w: 8, d: 5 }, // 11 summit (flag)
];

/** Indices of the wide landing steps that host rotating sweeper bars. */
const CLIMB_LANDINGS = [
  { i: 2, speed: 1.5, phase: 0, model: "swiperLong_teamRed" },
  { i: 5, speed: -1.7, phase: 1.0, model: "swiperLong_teamBlue" },
  { i: 8, speed: 1.6, phase: 2.0, model: "swiperLong_teamYellow" },
];

/** Y a climber must reach (top of the summit step) to finish the round. */
export const CLIMB_FINISH_Y = CLIMB_STEPS[CLIMB_STEPS.length - 1]!.y;

export function climbMap(): MinigameMap {
  const props: MapProp[] = [];
  const colliders: MapCollider[] = [];
  CLIMB_STEPS.forEach((s, i) => {
    colliders.push({ x: s.x, y: s.y - 0.5, z: s.z, hx: s.w / 2, hy: 0.5, hz: s.d / 2 });
    const model = i === CLIMB_STEPS.length - 1 ? "tileLarge_forest" : "tileLarge_teamYellow";
    const cols = Math.max(1, Math.round(s.w / 4));
    const rows = Math.max(1, Math.round(s.d / 4));
    const tw = s.w / cols;
    const td = s.d / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        props.push({
          model,
          x: s.x - s.w / 2 + (c + 0.5) * tw,
          y: s.y,
          z: s.z - s.d / 2 + (r + 0.5) * td,
          size: Math.max(tw, td),
          anchor: "top",
        });
      }
    }
  });

  // Rotating sweeper bars on the landings (rendered + collided from roundClock).
  const sweepers: MapSweeper[] = CLIMB_LANDINGS.map((l) => {
    const s = CLIMB_STEPS[l.i]!;
    return {
      cx: s.x,
      cz: s.z,
      y: s.y + 1.1,
      reach: s.w / 2 - 0.2,
      thickness: 1.0,
      speed: l.speed,
      phase: l.phase,
      model: l.model,
    };
  });

  // Spike-roller proximity hazards on two of the wider steps.
  const hazards: MapHazard[] = [
    { x: -1.8, y: CLIMB_STEPS[8]!.y, z: CLIMB_STEPS[8]!.z + 1.0, radius: 1.3, model: "spikeRoller" },
    { x: 1.6, y: CLIMB_STEPS[10]!.y, z: CLIMB_STEPS[10]!.z, radius: 1.2, model: "spikeRoller" },
  ];
  for (const h of hazards) {
    props.push({ model: h.model, x: h.x, y: h.y, z: h.z, size: 2.2, anchor: "top", yaw: h.yaw ?? 0 });
  }

  const top = CLIMB_STEPS[CLIMB_STEPS.length - 1]!;
  props.push({ model: "flag_teamYellow", x: top.x, y: top.y, z: top.z + 1.6, size: 2.5 });
  props.push(
    { model: "tree_forest", x: -5, y: 0, z: -9, size: 3.5 },
    { model: "tree_forest", x: 5, y: 0, z: -9, size: 3 },
    { model: "rocksB_forest", x: -4, y: 0, z: -6, size: 2 },
  );

  const base = CLIMB_STEPS[0]!;
  return {
    id: "climb",
    props,
    colliders,
    sweepers,
    hazards,
    spawns: [
      { x: base.x - 2, y: base.y + SPAWN_Y, z: base.z },
      { x: base.x + 2, y: base.y + SPAWN_Y, z: base.z },
      { x: base.x - 1, y: base.y + SPAWN_Y, z: base.z - 1.5 },
      { x: base.x + 1, y: base.y + SPAWN_Y, z: base.z - 1.5 },
    ],
    killY: -6,
  };
}

// --- Gems on a crumbling floor ----------------------------------------------

export const GEMS = {
  /** Gems present at once. */
  count: 14,
  /** Pickup radius. */
  pickupR: 1.1,
  /** Seconds before a collected gem reappears on another live tile. */
  respawn: 1.3,
  /** Gem visual variants (Variety pickups). */
  variants: ["diamond_teamBlue", "heart_teamRed", "star"] as const,
} as const;

/** The crumbling-floor grid: tiles drop a beat after a player stands on them. */
export const CRUMBLE = {
  cols: 8,
  rows: 8,
  spacing: 3,
  tileSize: 2.7,
  thickness: 0.5,
  /** Seconds a tile lasts after first being stepped on. */
  removeDelay: 1.1,
  /** Tile models (alternated like a checkerboard by the client). */
  models: ["tileLarge_teamBlue", "tileLarge_teamRed"] as const,
} as const;

/** World positions of every crumble-floor tile (tops at y=0). */
export function crumbleTiles(): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  const offX = ((CRUMBLE.cols - 1) * CRUMBLE.spacing) / 2;
  const offZ = ((CRUMBLE.rows - 1) * CRUMBLE.spacing) / 2;
  for (let r = 0; r < CRUMBLE.rows; r++) {
    for (let c = 0; c < CRUMBLE.cols; c++) {
      out.push({ x: c * CRUMBLE.spacing - offX, z: r * CRUMBLE.spacing - offZ });
    }
  }
  return out;
}

/** Spectator ledge (fallen players watch from here; separated by a gap). */
export const CRUMBLE_LEDGE = { x: 0, y: 0, z: -20, w: 12, d: 4 } as const;

/**
 * Gem rush on a crumbling floor: the floor is the crumble tile grid (built by the
 * minigame's colliders + the client), with no solid floor underneath. Grab gems
 * (they only appear on live tiles) before the floor drops out from under you;
 * fall and you watch from the ledge. Most gems wins.
 */
export function gemsMap(): MinigameMap {
  const props: MapProp[] = [];
  const colliders: MapCollider[] = [];

  // Spectator ledge.
  const L = CRUMBLE_LEDGE;
  colliders.push({ x: L.x, y: L.y - 0.5, z: L.z, hx: L.w / 2, hy: 0.5, hz: L.d / 2 });
  for (const x of [-4, 0, 4]) {
    props.push({ model: "tileLarge_forest", x, y: L.y, z: L.z, size: 4, anchor: "top" });
  }
  props.push(
    { model: "tree_forest", x: -7, y: L.y, z: L.z, size: 3 },
    { model: "tree_forest", x: 7, y: L.y, z: L.z, size: 3 },
  );

  return {
    id: "gems",
    props,
    colliders,
    spawns: [
      { x: -3, y: SPAWN_Y, z: -3 },
      { x: 3, y: SPAWN_Y, z: -3 },
      { x: -3, y: SPAWN_Y, z: 3 },
      { x: 3, y: SPAWN_Y, z: 3 },
    ],
    killY: -8,
  };
}

/** All Variety prop basenames the game references — used to preload on the client. */
export function allMapProps(): string[] {
  const maps = [footballMap(), shootingMap(), climbMap(), gemsMap()];
  const set = new Set<string>();
  for (const m of maps) {
    for (const p of m.props) set.add(p.model);
    for (const s of m.sweepers ?? []) set.add(s.model);
    for (const h of m.hazards ?? []) set.add(h.model);
  }
  // Crumble floor tiles (built client-side, not in any map's props).
  for (const m of CRUMBLE.models) set.add(m);
  // Entity props (ball / targets / gems) the dynamic layer renders.
  set.add("ball_teamRed");
  set.add("target");
  set.add("targetStand");
  for (const v of GEMS.variants) set.add(v);
  return [...set];
}
