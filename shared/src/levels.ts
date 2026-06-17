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

/** A soccer goal trigger zone; the ball entering scores for the last toucher. */
export interface GoalZone {
  /** Owning team color index (visual). */
  team: number;
  x: number;
  y: number;
  z: number;
  hx: number;
  hy: number;
  hz: number;
}

export interface MinigameMap {
  id: string;
  props: MapProp[];
  colliders: MapCollider[];
  spawns: Vec3[];
  /** Below this Y a player has fallen off and is respawned (never eliminated). */
  killY: number;
  goals?: GoalZone[];
}

const SPAWN_Y = 2;

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

/** Soccer pitch: two wide goals, a dynamic ball, low side/back walls. Score by
 * pushing/kicking the ball into either goal (counts for the last toucher). */
export function footballMap(): MinigameMap {
  const HALF_X = 8;
  const HALF_Z = 12;
  const GOAL_HALF = 3;
  const props: MapProp[] = [];
  const colliders: MapCollider[] = [floorCollider(HALF_X, HALF_Z)];

  // Two-tone pitch (blue half / red half).
  props.push(
    ...floorTiles(
      (_c, r) => (r < 3 ? "tileLarge_teamBlue" : "tileLarge_teamRed"),
      4,
      6,
      4,
    ),
  );

  // Goals at each end, facing inward.
  props.push({ model: "gateLargeWide_teamBlue", x: 0, y: 0, z: -HALF_Z, yaw: 0, size: 7 });
  props.push({ model: "gateLargeWide_teamRed", x: 0, y: 0, z: HALF_Z, yaw: Math.PI, size: 7 });

  // Side walls (full length).
  const left = wall("x", -HALF_X - 0.4, -HALF_Z, HALF_Z, 1.2, "barrierLarge");
  const right = wall("x", HALF_X + 0.4, -HALF_Z, HALF_Z, 1.2, "barrierLarge");
  props.push(...left.props, ...right.props);
  colliders.push(...left.colliders, ...right.colliders);

  // Back walls either side of each goal mouth.
  for (const z of [-HALF_Z - 0.4, HALF_Z + 0.4]) {
    const a = wall("z", z, -HALF_X, -GOAL_HALF, 1.2, "barrierLarge");
    const b = wall("z", z, GOAL_HALF, HALF_X, 1.2, "barrierLarge");
    props.push(...a.props, ...b.props);
    colliders.push(...a.colliders, ...b.colliders);
  }

  return {
    id: "football",
    props,
    colliders,
    spawns: [
      { x: -4, y: SPAWN_Y, z: -4 },
      { x: 4, y: SPAWN_Y, z: -4 },
      { x: -4, y: SPAWN_Y, z: 4 },
      { x: 4, y: SPAWN_Y, z: 4 },
    ],
    killY: -8,
    goals: [
      { team: 0, x: 0, y: 1.2, z: -HALF_Z - 0.9, hx: GOAL_HALF, hy: 1.6, hz: 0.9 },
      { team: 1, x: 0, y: 1.2, z: HALF_Z + 0.9, hx: GOAL_HALF, hy: 1.6, hz: 0.9 },
    ],
  };
}

// --- Shooting gallery -------------------------------------------------------

export const SHOOTING = {
  /** Active targets at once. */
  targets: 6,
  /** Max shot range (world units). */
  range: 16,
  /** Aim cone half-angle (radians) — forgiving for keyboard aim. */
  cone: 0.32,
  /** Seconds between shots. */
  cooldown: 0.45,
  /** Candidate target spots (a target lives at one of these, then relocates). */
  spots: [
    { x: -8, z: 5 },
    { x: -4, z: 7 },
    { x: 0, z: 6 },
    { x: 4, z: 7 },
    { x: 8, z: 5 },
    { x: -7, z: 2 },
    { x: 7, z: 2 },
    { x: -3, z: 4 },
    { x: 3, z: 4 },
    { x: 0, z: 3 },
  ] as { x: number; z: number }[],
  /** Height of a target's center. */
  y: 1.3,
} as const;

/** Shooting gallery: a desert platform; shoot the targets that pop up. */
export function shootingMap(): MinigameMap {
  const HALF_X = 10;
  const HALF_Z = 8;
  const props: MapProp[] = floorTiles("tileLarge_desert", 5, 4, 4);
  const colliders: MapCollider[] = [floorCollider(HALF_X, HALF_Z)];
  for (const [axis, fixed, from, to] of [
    ["x", -HALF_X - 0.4, -HALF_Z, HALF_Z],
    ["x", HALF_X + 0.4, -HALF_Z, HALF_Z],
    ["z", -HALF_Z - 0.4, -HALF_X, HALF_X],
    ["z", HALF_Z + 0.4, -HALF_X, HALF_X],
  ] as const) {
    const w = wall(axis, fixed, from, to, 1.0, "barrierMedium");
    props.push(...w.props);
    colliders.push(...w.colliders);
  }
  // Desert dressing in the corners.
  props.push(
    { model: "rocksA_desert", x: -9, y: 0, z: -7, size: 2 },
    { model: "tree_desert", x: 9, y: 0, z: -7, size: 3 },
    { model: "plantA_desert", x: 9, y: 0, z: 7, size: 1.4 },
  );
  return {
    id: "shooting",
    props,
    colliders,
    spawns: [
      { x: -6, y: SPAWN_Y, z: -6 },
      { x: -2, y: SPAWN_Y, z: -6 },
      { x: 2, y: SPAWN_Y, z: -6 },
      { x: 6, y: SPAWN_Y, z: -6 },
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
 * A straight, forgiving staircase rising to a flag: aligned on x=0 so moving
 * forward (and jumping) climbs it, with gentle 1.0-high steps and ~2.8 gaps that
 * both players and bots can clear. First to the top scores most.
 */
export const CLIMB_STEPS: ClimbStep[] = [
  { x: 0, y: 0, z: -9, w: 8, d: 4 }, // base
  { x: 0, y: 1.0, z: -6, w: 6, d: 3 },
  { x: 0, y: 2.0, z: -3.2, w: 6, d: 3 },
  { x: 0, y: 3.0, z: -0.4, w: 6, d: 3 },
  { x: 0, y: 4.0, z: 2.4, w: 6, d: 3 },
  { x: 0, y: 5.0, z: 5.2, w: 6, d: 3 },
  { x: 0, y: 6.0, z: 8.2, w: 8, d: 5 }, // summit
];

/** Y a climber must reach (top of the summit step) to finish the round. */
export const CLIMB_FINISH_Y = CLIMB_STEPS[CLIMB_STEPS.length - 1]!.y;

export function climbMap(): MinigameMap {
  const props: MapProp[] = [];
  const colliders: MapCollider[] = [];
  CLIMB_STEPS.forEach((s, i) => {
    colliders.push({ x: s.x, y: s.y - 0.5, z: s.z, hx: s.w / 2, hy: 0.5, hz: s.d / 2 });
    const model = i === CLIMB_STEPS.length - 1 ? "tileLarge_forest" : "tileLarge_teamYellow";
    // Cover each step with one or more tiles.
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
  const top = CLIMB_STEPS[CLIMB_STEPS.length - 1]!;
  props.push({ model: "flag_teamYellow", x: top.x, y: top.y, z: top.z + 1.5, size: 2.5 });
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
    spawns: [
      { x: base.x - 2, y: base.y + SPAWN_Y, z: base.z },
      { x: base.x + 2, y: base.y + SPAWN_Y, z: base.z },
      { x: base.x - 1, y: base.y + SPAWN_Y, z: base.z - 1.5 },
      { x: base.x + 1, y: base.y + SPAWN_Y, z: base.z - 1.5 },
    ],
    killY: -6,
  };
}

// --- Collect gems -----------------------------------------------------------

export const GEMS = {
  /** Gems present at once. */
  count: 14,
  /** Pickup radius. */
  pickupR: 1.1,
  /** Half-extent of the square arena gems spawn within. */
  half: 11,
  /** Seconds before a collected gem reappears elsewhere. */
  respawn: 1.5,
  /** Gem visual variants (Variety pickups). */
  variants: ["diamond_teamBlue", "heart_teamRed", "star"] as const,
} as const;

export function gemsMap(): MinigameMap {
  const HALF = 12;
  const props: MapProp[] = floorTiles("tileLarge_forest", 6, 6, 4);
  const colliders: MapCollider[] = [floorCollider(HALF, HALF)];
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
  props.push(
    { model: "tree_forest", x: -10, y: 0, z: -10, size: 3.5 },
    { model: "tree_forest", x: 10, y: 0, z: 10, size: 3.5 },
    { model: "plantB_forest", x: 10, y: 0, z: -10, size: 1.6 },
    { model: "plantA_forest", x: -10, y: 0, z: 10, size: 1.6 },
  );
  return {
    id: "gems",
    props,
    colliders,
    spawns: [
      { x: -8, y: SPAWN_Y, z: -8 },
      { x: 8, y: SPAWN_Y, z: -8 },
      { x: -8, y: SPAWN_Y, z: 8 },
      { x: 8, y: SPAWN_Y, z: 8 },
    ],
    killY: -8,
  };
}

/** All Variety prop basenames any map references — used to preload on the client. */
export function allMapProps(): string[] {
  const maps = [footballMap(), shootingMap(), climbMap(), gemsMap()];
  const set = new Set<string>();
  for (const m of maps) for (const p of m.props) set.add(p.model);
  // Entity props (ball / targets / gems) the dynamic layer renders.
  set.add("ball_teamRed");
  set.add("target");
  set.add("targetStand");
  for (const v of GEMS.variants) set.add(v);
  return [...set];
}
