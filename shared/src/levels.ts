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
  /** Pitch (tilt about X) in radians, for ramps (default 0). */
  pitch?: number;
  /** Target footprint = largest horizontal dimension, world units (default 2). */
  size?: number;
  /** Vertical anchor (default "bottom"). */
  anchor?: PropAnchor;
}

/** A physics collider box (axis aligned, optional yaw/pitch), half-extents from center. */
export interface MapCollider {
  x: number;
  y: number;
  z: number;
  hx: number;
  hy: number;
  hz: number;
  yaw?: number;
  /** Pitch (tilt about X) in radians, for ramps (default 0). */
  pitch?: number;
}

/** Quaternion {x,y,z,w} composing a yaw (about Y) then a pitch (about X). */
export function yawPitchQuat(
  yaw: number,
  pitch: number,
): { x: number; y: number; z: number; w: number } {
  const cy = Math.cos(yaw / 2);
  const sy = Math.sin(yaw / 2);
  const cp = Math.cos(pitch / 2);
  const sp = Math.sin(pitch / 2);
  return { x: cy * sp, y: sy * cp, z: -sy * sp, w: cy * cp };
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

/**
 * A side barrel that periodically launches a ball straight across the path. The
 * ball's position is a deterministic function of the synced round clock, so the
 * client renders it and the server resolves knockback without a physics body.
 */
export interface MapLauncher {
  /** Barrel position (the launch origin). */
  x: number;
  y: number;
  z: number;
  /** Unit travel direction (dx,dz) the ball rolls along. */
  dx: number;
  dz: number;
  /** Ball speed (units/s) and how far it travels before looping. */
  speed: number;
  range: number;
  /** Seconds between launches (one ball in flight at a time). */
  interval: number;
  /** Phase offset (s) so barrels do not all fire together. */
  phase: number;
  ballR: number;
  /** Barrel + ball prop basenames. */
  model: string;
  ballModel: string;
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
  /** Side barrels that launch rolling balls (deterministic from round clock). */
  launchers?: MapLauncher[];
}

/**
 * The active ball position for a launcher at time t (since round start), or null
 * while the barrel is between launches. Looping: a ball travels `range` then the
 * barrel reloads for the rest of `interval`.
 */
export function launcherBall(l: MapLauncher, t: number): { x: number; y: number; z: number } | null {
  const flight = l.range / l.speed;
  const local = (t + l.phase) % l.interval;
  if (local > flight) return null; // reloading
  const d = local * l.speed;
  return { x: l.x + l.dx * d, y: l.y, z: l.z + l.dz * d };
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

// --- Soccer (2v2) -----------------------------------------------------------

/** Soccer is 2 teams of 2: team 0 = Blue, team 1 = Red. */
export const SOCCER = {
  halfX: 8,
  halfZ: 12,
  goalHalf: 3,
  wallH: 3,
} as const;

/**
 * 2v2 soccer pitch: a rectangle with one goal per team at each end (Blue at -z,
 * Red at +z) and a TALL invisible perimeter wall (only the goal mouths open) so
 * the ball can never leave. The ball in a team's own net scores for the OTHER
 * team. GoalZone.owner = the team that DEFENDS that goal.
 */
export function footballMap(): MinigameMap {
  const { halfX, halfZ, goalHalf, wallH } = SOCCER;
  const props: MapProp[] = floorTiles(
    (_c, r) => (r < 3 ? "tileLarge_teamBlue" : "tileLarge_teamRed"),
    4,
    6,
    4,
  );
  const colliders: MapCollider[] = [floorCollider(halfX, halfZ)];

  // Goals at each end (open into the pitch) + team flags for clear identity.
  props.push(
    { model: "gateLargeWide_teamBlue", x: 0, y: 0, z: -halfZ, yaw: 0, size: 7 },
    { model: "gateLargeWide_teamRed", x: 0, y: 0, z: halfZ, yaw: Math.PI, size: 7 },
    { model: "flag_teamBlue", x: -goalHalf - 0.5, y: 0, z: -halfZ + 0.5, size: 1.8 },
    { model: "flag_teamBlue", x: goalHalf + 0.5, y: 0, z: -halfZ + 0.5, size: 1.8 },
    { model: "flag_teamRed", x: -goalHalf - 0.5, y: 0, z: halfZ - 0.5, size: 1.8 },
    { model: "flag_teamRed", x: goalHalf + 0.5, y: 0, z: halfZ - 0.5, size: 1.8 },
    // Corner flags (pitch dressing).
    { model: "flag_teamYellow", x: -halfX + 0.6, y: 0, z: -halfZ + 0.6, size: 1.4 },
    { model: "flag_teamYellow", x: halfX - 0.6, y: 0, z: -halfZ + 0.6, size: 1.4 },
    { model: "flag_teamYellow", x: -halfX + 0.6, y: 0, z: halfZ - 0.6, size: 1.4 },
    { model: "flag_teamYellow", x: halfX - 0.6, y: 0, z: halfZ - 0.6, size: 1.4 },
  );

  // Tall invisible side walls (full length).
  for (const x of [-halfX - 0.4, halfX + 0.4]) {
    const w = wall("x", x, -halfZ, halfZ, wallH, "barrierLarge");
    props.push(...w.props);
    colliders.push(...w.colliders);
  }
  // End walls flanking each goal mouth.
  for (const z of [-halfZ - 0.4, halfZ + 0.4]) {
    for (const seg of [
      [-halfX, -goalHalf],
      [goalHalf, halfX],
    ] as const) {
      const w = wall("z", z, seg[0], seg[1], wallH, "barrierLarge");
      props.push(...w.props);
      colliders.push(...w.colliders);
    }
  }

  return {
    id: "football",
    props,
    colliders,
    // index%2 -> team (0 Blue, 1 Red); Blue defends -z, Red defends +z.
    spawns: [
      { x: -3, y: SPAWN_Y, z: -7 }, // 0 Blue
      { x: -3, y: SPAWN_Y, z: 7 }, // 1 Red
      { x: 3, y: SPAWN_Y, z: -7 }, // 2 Blue
      { x: 3, y: SPAWN_Y, z: 7 }, // 3 Red
    ],
    killY: -8,
    goals: [
      { owner: 0, team: 0, x: 0, y: 1.2, z: -halfZ - 0.9, hx: goalHalf, hy: 1.6, hz: 0.9 },
      { owner: 1, team: 1, x: 0, y: 1.2, z: halfZ + 0.9, hx: goalHalf, hy: 1.6, hz: 0.9 },
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
  /** Candidate target spots (far side of the barrier, at -z so they face the
   * shooters and sit in the camera's view). Targets relocate between them. */
  spots: [
    { x: -8, z: -8 },
    { x: -4, z: -6 },
    { x: 0, z: -9 },
    { x: 4, z: -6 },
    { x: 8, z: -8 },
    { x: -7, z: -3 },
    { x: 7, z: -3 },
    { x: -3, z: -5 },
    { x: 3, z: -5 },
    { x: 0, z: -4 },
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
  // The dividing barrier between shooters (z > 1) and targets (z < -1): a TALL
  // collider so players cannot cross or jump it (the visible barrier stays low).
  const divider = wall("z", 1, -HALF_X, HALF_X, 3.2, "barrierLarge");
  props.push(...divider.props);
  colliders.push(...divider.colliders);
  // Desert dressing.
  props.push(
    { model: "rocksA_desert", x: -9, y: 0, z: -9, size: 2 },
    { model: "tree_desert", x: 9, y: 0, z: -9, size: 3 },
    { model: "plantA_desert", x: -9, y: 0, z: 9, size: 1.4 },
  );
  return {
    id: "shooting",
    props,
    colliders,
    spawns: [
      { x: -6, y: SPAWN_Y, z: 7 },
      { x: -2, y: SPAWN_Y, z: 7 },
      { x: 2, y: SPAWN_Y, z: 7 },
      { x: 6, y: SPAWN_Y, z: 7 },
    ],
    killY: -8,
  };
}

// --- Climb (two routes) -----------------------------------------------------

export interface ClimbStep {
  x: number;
  y: number;
  z: number;
  w: number;
  d: number;
}

/** Base + fork (both routes start here). */
const CLIMB_BASE: ClimbStep = { x: 0, y: 0, z: -9, w: 10, d: 4 };
const CLIMB_FORK: ClimbStep = { x: 0, y: 1, z: -5.5, w: 10, d: 3 };

/**
 * EASY route (blue, the LONG one): a long weaving jump course on the left — many
 * spaced platforms you must jump between, winding left/right while climbing
 * gently. Challenging but fair (small rises, moderate gaps). ~3x the old length.
 */
function buildEasyRoute(): ClimbStep[] {
  const out: ClimbStep[] = [];
  const n = 22; // fewer, more separated platforms = real jumps (miss = fall to the void)
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const y = 1.6 + t * 6.2; // gentle rise to ~7.8
    const z = -3 + (i - 1) * 0.95; // bigger spacing toward the summit (ends ~z17)
    // Pushed far to the -x side (well separated from the yellow route at +x),
    // funnelling back to the summit (x~0) only at the very top.
    const center = -8 * (1 - t);
    const amp = 4.5 * (1 - t * 0.6);
    const x = center + Math.sin(i * 0.85) * amp;
    out.push({ x, y, z, w: 2.6, d: 2.4 });
  }
  return out;
}
export const CLIMB_EASY: ClimbStep[] = buildEasyRoute();

/**
 * HARD route (yellow, the OBSTACLE one): wide, gentle steps so the platforming is
 * easy — the challenge is the obstacles (sweepers, spike rollers, launched balls).
 * "More developed but less difficult."
 */
export const CLIMB_HARD: ClimbStep[] = [
  { x: 4.5, y: 2.2, z: -2.0, w: 5, d: 3.4 },
  { x: 5.5, y: 3.0, z: 0.6, w: 4.8, d: 3.2 },
  { x: 5.5, y: 3.8, z: 3.2, w: 4.8, d: 3.2 },
  { x: 5, y: 4.6, z: 5.8, w: 4.8, d: 3.2 },
  { x: 4.5, y: 5.4, z: 8.4, w: 4.8, d: 3.2 },
  { x: 4.5, y: 6.2, z: 11.0, w: 4.8, d: 3.2 },
  { x: 4.5, y: 7.0, z: 13.6, w: 5, d: 3.4 },
  { x: 4, y: 7.8, z: 16.0, w: 5, d: 3.4 },
];

/** The raised WIN platform: climb onto it to win the round. Both routes hop up. */
const CLIMB_SUMMIT: ClimbStep = { x: 0, y: 9.5, z: 18, w: 8, d: 6 };

/** Y a climber must reach (summit top) to finish the round. */
export const CLIMB_FINISH_Y = CLIMB_SUMMIT.y;

/** Bot routing: ordered waypoints (a platform sequence) for each route. */
export const CLIMB_ROUTES: { easy: ClimbStep[]; hard: ClimbStep[] } = {
  easy: [CLIMB_BASE, CLIMB_FORK, ...CLIMB_EASY, CLIMB_SUMMIT],
  hard: [CLIMB_BASE, CLIMB_FORK, ...CLIMB_HARD, CLIMB_SUMMIT],
};

/** Every platform (for colliders + which-step-am-I-on checks). */
export function climbPlatforms(): ClimbStep[] {
  return [CLIMB_BASE, CLIMB_FORK, ...CLIMB_EASY, ...CLIMB_HARD, CLIMB_SUMMIT];
}

export function climbSummit(): ClimbStep {
  return CLIMB_SUMMIT;
}

function tileStep(s: ClimbStep, model: string): MapProp[] {
  const cols = Math.max(1, Math.round(s.w / 3.5));
  const rows = Math.max(1, Math.round(s.d / 3.5));
  const tw = s.w / cols;
  const td = s.d / rows;
  const out: MapProp[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      out.push({
        model,
        x: s.x - s.w / 2 + (c + 0.5) * tw,
        y: s.y,
        z: s.z - s.d / 2 + (r + 0.5) * td,
        size: Math.max(tw, td),
        anchor: "top",
      });
    }
  }
  return out;
}

export function climbMap(): MinigameMap {
  const props: MapProp[] = [];
  const colliders: MapCollider[] = [];

  for (const s of climbPlatforms()) {
    colliders.push({ x: s.x, y: s.y - 0.5, z: s.z, hx: s.w / 2, hy: 0.5, hz: s.d / 2 });
  }
  // Visual tiles: base/fork neutral, easy = blue (long route), hard = yellow,
  // summit = a distinct gold WIN platform.
  props.push(...tileStep(CLIMB_BASE, "tileLarge_forest"));
  props.push(...tileStep(CLIMB_FORK, "tileLarge_forest"));
  for (const s of CLIMB_EASY) props.push(...tileStep(s, "tileLarge_teamBlue"));
  for (const s of CLIMB_HARD) props.push(...tileStep(s, "tileLarge_teamYellow"));
  props.push(...tileStep(CLIMB_SUMMIT, "tileLarge_teamYellow"));

  // Hard-route rotating sweepers (more developed — three bars up the climb).
  const sweepers: MapSweeper[] = [
    sweeperOn(CLIMB_HARD[1]!, 1.5, 0, "swiperLong_teamRed"),
    sweeperOn(CLIMB_HARD[3]!, -1.6, 1.0, "swiperLong_teamBlue"),
    sweeperOn(CLIMB_HARD[5]!, 1.7, 2.0, "swiperLong_teamYellow"),
  ];

  // Hard-route spike rollers (off-center so the wide platforms stay passable).
  const hazards: MapHazard[] = [
    { x: CLIMB_HARD[2]!.x - 1.4, y: CLIMB_HARD[2]!.y, z: CLIMB_HARD[2]!.z, radius: 1.2, model: "spikeRoller" },
    { x: CLIMB_HARD[6]!.x + 1.4, y: CLIMB_HARD[6]!.y, z: CLIMB_HARD[6]!.z, radius: 1.2, model: "spikeRoller" },
  ];
  for (const h of hazards) {
    props.push({ model: h.model, x: h.x, y: h.y, z: h.z, size: 2.0, anchor: "top" });
  }

  // Side barrels that launch balls across the hard route (three of them).
  const launchers: MapLauncher[] = [
    launcherAcross(CLIMB_HARD[0]!, 0),
    launcherAcross(CLIMB_HARD[3]!, 1.2),
    launcherAcross(CLIMB_HARD[6]!, 2.2),
  ];
  for (const l of launchers) {
    props.push({ model: l.model, x: l.x, y: l.y, z: l.z, size: 1.8, anchor: "bottom", yaw: Math.PI / 2 });
  }

  // WIN platform dressing: a big flag + corner flags + stars so it reads as "the
  // goal — reach it to win". Plus fork signposts (blue left = long, yellow right =
  // short) and base decor.
  const sx = CLIMB_SUMMIT.x;
  const sy = CLIMB_SUMMIT.y;
  const sz = CLIMB_SUMMIT.z;
  props.push(
    { model: "flag_teamYellow", x: sx, y: sy, z: sz + 1.6, size: 3 },
    { model: "flag_teamYellow", x: sx - 3, y: sy, z: sz - 2, size: 1.8 },
    { model: "flag_teamYellow", x: sx + 3, y: sy, z: sz - 2, size: 1.8 },
    { model: "star", x: sx - 2, y: sy + 0.4, z: sz, size: 1.2, anchor: "center" },
    { model: "star", x: sx + 2, y: sy + 0.4, z: sz, size: 1.2, anchor: "center" },
    { model: "flag_teamBlue", x: -3, y: CLIMB_FORK.y, z: CLIMB_FORK.z + 1, size: 1.6 },
    { model: "flag_teamYellow", x: 3, y: CLIMB_FORK.y, z: CLIMB_FORK.z + 1, size: 1.6 },
    { model: "tree_forest", x: -10, y: 0, z: -8, size: 3.5 },
    { model: "tree_forest", x: 10, y: 0, z: -8, size: 3 },
    { model: "rocksB_forest", x: -8, y: 0, z: -5, size: 2 },
  );

  return {
    id: "climb",
    props,
    colliders,
    sweepers,
    hazards,
    launchers,
    spawns: [
      { x: CLIMB_BASE.x - 2.5, y: CLIMB_BASE.y + SPAWN_Y, z: CLIMB_BASE.z },
      { x: CLIMB_BASE.x + 2.5, y: CLIMB_BASE.y + SPAWN_Y, z: CLIMB_BASE.z },
      { x: CLIMB_BASE.x - 1, y: CLIMB_BASE.y + SPAWN_Y, z: CLIMB_BASE.z - 1 },
      { x: CLIMB_BASE.x + 1, y: CLIMB_BASE.y + SPAWN_Y, z: CLIMB_BASE.z - 1 },
    ],
    killY: -6,
  };
}

function sweeperOn(s: ClimbStep, speed: number, phase: number, model: string): MapSweeper {
  return { cx: s.x, cz: s.z, y: s.y + 1.1, reach: s.w / 2 + 0.4, thickness: 1.0, speed, phase, model };
}

/** A barrel on the +x side firing a ball toward -x across the hard step. */
function launcherAcross(s: ClimbStep, phase: number): MapLauncher {
  return {
    x: 8.5,
    y: s.y,
    z: s.z,
    dx: -1,
    dz: 0,
    speed: 6,
    range: 9,
    interval: 3,
    phase,
    ballR: 0.5,
    model: "powerupBlock_teamRed",
    ballModel: "ball_teamYellow",
  };
}

// --- Gems on a crumbling floor ----------------------------------------------

export const GEMS = {
  /** Gems present at once. */
  count: 18,
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

// --- Lobby parkour (playable while waiting) ---------------------------------

/** A symmetric arch of jump platforms (up to a flag apex, then back down) to warm
 * up on while waiting for players. */
const LOBBY_STEPS: ClimbStep[] = [
  { x: -6, y: 1.0, z: -2, w: 3.2, d: 3 },
  { x: -7, y: 2.0, z: -6, w: 3, d: 3 },
  { x: -4, y: 3.0, z: -9, w: 3, d: 3 },
  { x: 0, y: 4.2, z: -10.5, w: 4, d: 3.5 }, // apex (flag)
  { x: 4, y: 3.0, z: -9, w: 3, d: 3 },
  { x: 7, y: 2.0, z: -6, w: 3, d: 3 },
  { x: 6, y: 1.0, z: -2, w: 3.2, d: 3 },
];
const LOBBY_APEX = LOBBY_STEPS[3]!;

/**
 * A small, self-contained lobby parkour: a plaza with a ramp + a loop of jump
 * platforms. No scoring — just somewhere to move around while the lobby fills.
 */
export function lobbyMap(): MinigameMap {
  const HALF = 11;
  const props: MapProp[] = floorTiles("tileLarge_forest", 6, 6, 4);
  const colliders: MapCollider[] = [floorCollider(HALF, HALF)];

  // Low perimeter wall so you stay on the plaza (except via the parkour).
  for (const [axis, fixed, from, to] of [
    ["x", -HALF - 0.4, -HALF, HALF],
    ["x", HALF + 0.4, -HALF, HALF],
    ["z", -HALF - 0.4, -HALF, HALF],
    ["z", HALF + 0.4, -HALF, HALF],
  ] as const) {
    const w = wall(axis, fixed, from, to, 1.0, "barrierMedium");
    props.push(...w.props);
    colliders.push(...w.colliders);
  }

  // Jump platforms (a loop) + a gentle walk-up ramp from the plaza.
  for (const s of LOBBY_STEPS) {
    colliders.push({ x: s.x, y: s.y - 0.5, z: s.z, hx: s.w / 2, hy: 0.5, hz: s.d / 2 });
    props.push(...tileStep(s, "tileLarge_teamBlue"));
  }
  // Ramp: a tilted slab leading up off the plaza (showcases the pitch support).
  const rampPitch = 0.3; // ~17 degrees
  colliders.push({ x: -8, y: 0.5, z: 1, hx: 1.6, hy: 0.25, hz: 3.2, pitch: rampPitch });
  props.push({ model: "tileSlopeLowMedium_teamBlue", x: -8, y: 0, z: 1, size: 3.4, pitch: rampPitch });

  // A flag on the apex platform + decor.
  props.push(
    { model: "flag_teamYellow", x: LOBBY_APEX.x, y: LOBBY_APEX.y, z: LOBBY_APEX.z, size: 2.4 },
    { model: "star", x: LOBBY_APEX.x, y: LOBBY_APEX.y + 0.6, z: LOBBY_APEX.z - 1.2, size: 1.1, anchor: "center" },
    { model: "tree_forest", x: -9, y: 0, z: 8, size: 3.5 },
    { model: "tree_forest", x: 9, y: 0, z: 8, size: 3.5 },
    { model: "plantA_forest", x: 9, y: 0, z: -8, size: 1.6 },
    { model: "rocksB_forest", x: -9, y: 0, z: 8, size: 2 },
  );

  return {
    id: "lobby",
    props,
    colliders,
    spawns: [
      { x: -2, y: SPAWN_Y, z: 6 },
      { x: 2, y: SPAWN_Y, z: 6 },
      { x: -2, y: SPAWN_Y, z: 8 },
      { x: 2, y: SPAWN_Y, z: 8 },
    ],
    killY: -8,
  };
}

/** All Variety prop basenames the game references — used to preload on the client. */
export function allMapProps(): string[] {
  const maps = [footballMap(), shootingMap(), climbMap(), gemsMap(), lobbyMap()];
  const set = new Set<string>();
  for (const m of maps) {
    for (const p of m.props) set.add(p.model);
    for (const s of m.sweepers ?? []) set.add(s.model);
    for (const h of m.hazards ?? []) set.add(h.model);
    for (const l of m.launchers ?? []) {
      set.add(l.model);
      set.add(l.ballModel);
    }
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
