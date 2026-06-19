// PumpDash core simulation (pure TS, no Colyseus/Node/Rapier).
//
// A square arena with four sides (0 top, 1 bottom, 2 left, 3 right). Each player
// guards one side and slides only along that edge like a goalkeeper. One or more
// balls bounce around with simple 2D reflection on the arena plane. A ball that
// gets past an alive player's edge costs that player a point; reaching zero
// eliminates them and their side is walled off. Last player alive wins.
//
// This module is shared by the authoritative server room and the in-browser
// offline manager, so online and offline play identically.

// --- knobs ----------------------------------------------------------------
export const ARENA_HALF = 9; // half-extent of the square arena (world units)
export const PADDLE_HALF = 1.55; // half-width of a paddle along its slide axis
export const PADDLE_RANGE = ARENA_HALF - 1.6; // clamp so paddles stay off the corners
export const PADDLE_SPEED = 12; // paddle slide speed (units/sec)
export const BALL_R = 0.55;
export const START_POINTS = 8;
export const BALL_SPEED = 9.5; // base ball speed at match start
export const SPEED_RAMP = 0.22; // +units/sec of speed per second of play
export const SPEED_MAX = 18;
export const SPEED_BUMP = 0.8; // base speed added on every concede
export const BALL_COUNT = 1;
export const DASH_IMPULSE = 5; // extra ball speed on a dashed block
export const DASH_CD = 1.1; // dash cooldown (s)
export const DASH_TIME = 0.16; // dash active window (s)
export const ENGLISH = 0.35; // how much paddle motion curves the ball
export const OPEN_ELIMINATED_SIDE = false; // false = eliminated side becomes a wall

// Mini obstacles: appear (telegraph), live, then vanish; the ball bounces off them.
export const OBST_R = 0.95;
export const OBST_INTERVAL = 5.5; // seconds between spawn attempts
export const OBST_TELEGRAPH = 0.9; // warning time before it turns solid
export const OBST_LIFETIME = 5; // seconds solid
export const OBST_MAX = 3;
export const OBST_SPAWN_HALF = ARENA_HALF - 2.6; // keep obstacles inside the playfield
export const OBST_CLEAR_CENTER = 2.6; // keep the center (ball reset) clear

export interface SimObstacle {
  x: number;
  z: number;
  r: number;
  age: number;
  telegraph: number;
  life: number;
}

export interface BotSkill {
  react: number; // reaction delay (s) before retargeting
  err: number; // aim error (units)
  speed: number; // fraction of PADDLE_SPEED
}

export interface SimPlayer {
  id: string;
  side: number;
  isBot: boolean;
  t: number; // slide position along the edge
  vt: number; // slide velocity (for english + run anim)
  points: number;
  alive: boolean;
  dashCd: number;
  dashT: number;
  // input (humans)
  inSlide: number; // -1..1
  inDash: boolean;
  prevDash: boolean;
  // bot
  skill: BotSkill;
  reactTimer: number;
  aimT: number;
}

export interface SimBall {
  x: number;
  z: number;
  vx: number;
  vz: number;
}

export type SimEventKind = "hit" | "concede" | "eliminate" | "win";
export interface SimEvent {
  kind: SimEventKind;
  playerId: string;
}

const TWO_PI = Math.PI * 2;

/** Yaw (atan2(vx,vz) convention) so a paddle on `side` faces the arena center. */
export function faceYaw(side: number): number {
  switch (side) {
    case 0:
      return 0; // top, face +z
    case 1:
      return Math.PI; // bottom, face -z
    case 2:
      return Math.PI / 2; // left, face +x
    default:
      return -Math.PI / 2; // right, face -x
  }
}

/**
 * Sign that maps a player's "screen-right" slide intent to their edge axis, so
 * pressing right always moves the paddle right from that player's framed view.
 * (Each client frames its own side at the bottom of the screen.)
 */
export function slideSign(side: number): number {
  return side === 0 || side === 3 ? -1 : 1;
}

/** World (x,z) of a paddle on `side` at slide position `t`. */
export function sideWorld(side: number, t: number): { x: number; z: number } {
  switch (side) {
    case 0:
      return { x: t, z: -ARENA_HALF };
    case 1:
      return { x: t, z: ARENA_HALF };
    case 2:
      return { x: -ARENA_HALF, z: t };
    default:
      return { x: ARENA_HALF, z: t };
  }
}

export class PumpDashSim {
  readonly players = new Map<string, SimPlayer>();
  readonly balls: SimBall[] = [];
  readonly obstacles: SimObstacle[] = [];
  elapsed = 0;
  winnerId: string | null = null;
  ended = false;
  events: SimEvent[] = [];

  private concedeBonus = 0;
  private obstacleTimer = OBST_INTERVAL;

  /** Add a player on the first free side (0..3). Returns the assigned side, or -1. */
  addPlayer(id: string, isBot: boolean): number {
    const used = new Set<number>();
    for (const p of this.players.values()) used.add(p.side);
    let side = -1;
    // Prefer bottom for the first human so the local view matches; otherwise first free.
    const order = [1, 0, 2, 3];
    for (const s of order) {
      if (!used.has(s)) {
        side = s;
        break;
      }
    }
    if (side < 0) return -1;
    this.players.set(id, {
      id,
      side,
      isBot,
      t: 0,
      vt: 0,
      points: START_POINTS,
      alive: true,
      dashCd: 0,
      dashT: 0,
      inSlide: 0,
      inDash: false,
      prevDash: false,
      skill: randomSkill(),
      reactTimer: 0,
      aimT: 0,
    });
    return side;
  }

  removePlayer(id: string): void {
    this.players.delete(id);
  }

  setInput(id: string, slide: number, dash: boolean): void {
    const p = this.players.get(id);
    if (!p) return;
    p.inSlide = Math.max(-1, Math.min(1, slide));
    p.inDash = dash;
  }

  /** Spawn the configured balls at center with random directions. Call when play starts. */
  spawnBalls(): void {
    this.balls.length = 0;
    for (let i = 0; i < BALL_COUNT; i++) this.balls.push(this.freshBall());
    this.obstacles.length = 0;
    this.obstacleTimer = OBST_INTERVAL;
    this.elapsed = 0;
    this.concedeBonus = 0;
  }

  /** Is an obstacle solid (past its telegraph window)? */
  static isSolid(o: SimObstacle): boolean {
    return o.age >= o.telegraph;
  }

  private freshBall(): SimBall {
    const a = Math.random() * TWO_PI;
    const s = this.speed();
    return { x: 0, z: 0, vx: Math.cos(a) * s, vz: Math.sin(a) * s };
  }

  private speed(): number {
    return Math.min(SPEED_MAX, BALL_SPEED + SPEED_RAMP * this.elapsed + this.concedeBonus);
  }

  /** Advance the playing simulation by dt seconds. */
  step(dt: number): void {
    if (this.ended) return;
    this.events = [];
    this.elapsed += dt;

    for (const p of this.players.values()) {
      p.dashCd = Math.max(0, p.dashCd - dt);
      p.dashT = Math.max(0, p.dashT - dt);
      if (!p.alive) {
        p.vt = 0;
        continue;
      }
      const slide = p.isBot ? this.botSlide(p, dt) : p.inSlide;
      const dash = p.isBot ? false : p.inDash;
      if (dash && !p.prevDash && p.dashCd <= 0) {
        p.dashT = DASH_TIME;
        p.dashCd = DASH_CD;
      }
      p.prevDash = dash;

      const nt = clamp(p.t + slide * PADDLE_SPEED * p.skill.speed * dt, -PADDLE_RANGE, PADDLE_RANGE);
      p.vt = (nt - p.t) / Math.max(dt, 1e-4);
      p.t = nt;
    }

    this.updateObstacles(dt);

    for (const ball of this.balls) {
      ball.x += ball.vx * dt;
      ball.z += ball.vz * dt;
      this.resolveEdges(ball);
      this.resolveObstacles(ball);
    }

    this.checkWin();
  }

  /** Age obstacles, retire expired ones, and occasionally spawn new ones. */
  private updateObstacles(dt: number): void {
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const o = this.obstacles[i]!;
      o.age += dt;
      if (o.age >= o.telegraph + o.life) this.obstacles.splice(i, 1);
    }
    this.obstacleTimer -= dt;
    if (this.obstacleTimer <= 0) {
      this.obstacleTimer = OBST_INTERVAL;
      const want = 1 + Math.floor(Math.random() * 3);
      for (let n = 0; n < want && this.obstacles.length < OBST_MAX; n++) this.trySpawnObstacle();
    }
  }

  private trySpawnObstacle(): void {
    for (let attempt = 0; attempt < 8; attempt++) {
      const x = (Math.random() * 2 - 1) * OBST_SPAWN_HALF;
      const z = (Math.random() * 2 - 1) * OBST_SPAWN_HALF;
      if (Math.hypot(x, z) < OBST_CLEAR_CENTER) continue;
      let clear = true;
      for (const o of this.obstacles) {
        if (Math.hypot(o.x - x, o.z - z) < OBST_R * 3) {
          clear = false;
          break;
        }
      }
      if (!clear) continue;
      this.obstacles.push({ x, z, r: OBST_R, age: 0, telegraph: OBST_TELEGRAPH, life: OBST_LIFETIME });
      return;
    }
  }

  /** Reflect the ball off any solid obstacle it overlaps. */
  private resolveObstacles(ball: SimBall): void {
    for (const o of this.obstacles) {
      if (!PumpDashSim.isSolid(o)) continue;
      const dx = ball.x - o.x;
      const dz = ball.z - o.z;
      const dist = Math.hypot(dx, dz);
      const min = BALL_R + o.r;
      if (dist >= min || dist < 1e-4) continue;
      const nx = dx / dist;
      const nz = dz / dist;
      // Push the ball out and reflect its velocity about the surface normal.
      ball.x = o.x + nx * min;
      ball.z = o.z + nz * min;
      const dot = ball.vx * nx + ball.vz * nz;
      ball.vx -= 2 * dot * nx;
      ball.vz -= 2 * dot * nz;
      this.setMagnitude(ball, this.speed());
    }
  }

  private bySide(side: number): SimPlayer | undefined {
    for (const p of this.players.values()) if (p.side === side) return p;
    return undefined;
  }

  /** Bounce off / score through the four edges for a single ball. */
  private resolveEdges(ball: SimBall): void {
    // top (z = -HALF), normal +z
    if (ball.z - BALL_R <= -ARENA_HALF && ball.vz < 0) {
      this.hitEdge(ball, 0, ball.x, -ARENA_HALF, "z", +1);
    }
    // bottom (z = +HALF), normal -z
    if (ball.z + BALL_R >= ARENA_HALF && ball.vz > 0) {
      this.hitEdge(ball, 1, ball.x, ARENA_HALF, "z", -1);
    }
    // left (x = -HALF), normal +x
    if (ball.x - BALL_R <= -ARENA_HALF && ball.vx < 0) {
      this.hitEdge(ball, 2, ball.z, -ARENA_HALF, "x", +1);
    }
    // right (x = +HALF), normal -x
    if (ball.x + BALL_R >= ARENA_HALF && ball.vx > 0) {
      this.hitEdge(ball, 3, ball.z, ARENA_HALF, "x", -1);
    }
  }

  /**
   * @param axisPos ball coordinate along the edge's slide axis
   * @param edge world coordinate of the edge on the normal axis
   * @param normal which axis is the normal ("x" or "z")
   * @param into sign pushing the ball back into the arena along the normal
   */
  private hitEdge(
    ball: SimBall,
    side: number,
    axisPos: number,
    edge: number,
    normal: "x" | "z",
    into: number,
  ): void {
    const player = this.bySide(side);
    const covered =
      player && player.alive && Math.abs(axisPos - player.t) <= PADDLE_HALF + BALL_R;
    const isWall = !player || !player.alive ? !OPEN_ELIMINATED_SIDE : false;

    if (covered) {
      this.bounce(ball, player, normal, edge, into);
      this.events.push({ kind: "hit", playerId: player.id });
      return;
    }
    if (isWall) {
      this.bounce(ball, undefined, normal, edge, into);
      return;
    }
    // Open goal: the alive player on this side missed.
    if (player) {
      player.points -= 1;
      this.events.push({ kind: "concede", playerId: player.id });
      if (player.points <= 0) {
        player.points = 0;
        player.alive = false;
        this.events.push({ kind: "eliminate", playerId: player.id });
      }
      this.concedeBonus += SPEED_BUMP;
      this.resetBall(ball);
    }
  }

  private bounce(
    ball: SimBall,
    paddle: SimPlayer | undefined,
    normal: "x" | "z",
    edge: number,
    into: number,
  ): void {
    // Reflect the normal component and push the ball just inside the edge.
    if (normal === "z") {
      ball.z = edge + into * (BALL_R + 0.01);
      ball.vz = Math.abs(ball.vz) * into;
      if (paddle) ball.vx += paddle.vt * ENGLISH;
    } else {
      ball.x = edge + into * (BALL_R + 0.01);
      ball.vx = Math.abs(ball.vx) * into;
      if (paddle) ball.vz += paddle.vt * ENGLISH;
    }
    // Renormalize to the current base speed (+ dash impulse on a dashed block).
    const bonus = paddle && paddle.dashT > 0 ? DASH_IMPULSE : 0;
    this.setMagnitude(ball, this.speed() + bonus);
  }

  private resetBall(ball: SimBall): void {
    const a = Math.random() * TWO_PI;
    ball.x = 0;
    ball.z = 0;
    ball.vx = Math.cos(a);
    ball.vz = Math.sin(a);
    this.setMagnitude(ball, this.speed());
  }

  private setMagnitude(ball: SimBall, mag: number): void {
    const len = Math.hypot(ball.vx, ball.vz) || 1;
    ball.vx = (ball.vx / len) * mag;
    ball.vz = (ball.vz / len) * mag;
  }

  /** Goalkeeper AI: track the nearest threatening ball's intercept; else recenter. */
  private botSlide(p: SimPlayer, dt: number): number {
    p.reactTimer -= dt;
    if (p.reactTimer <= 0) {
      p.reactTimer = p.skill.react;
      const desired = this.interceptFor(p.side);
      const err = (Math.random() * 2 - 1) * p.skill.err;
      p.aimT = clamp(desired + err, -PADDLE_RANGE, PADDLE_RANGE);
    }
    const diff = p.aimT - p.t;
    if (Math.abs(diff) < 0.05) return 0;
    return diff > 0 ? 1 : -1;
  }

  /** Predicted slide coordinate where the soonest incoming ball will cross `side`. */
  private interceptFor(side: number): number {
    let best = 0;
    let bestT = Infinity;
    for (const ball of this.balls) {
      let tHit = Infinity;
      let pos = 0;
      if (side === 0 && ball.vz < 0) {
        tHit = (-ARENA_HALF - ball.z) / ball.vz;
        pos = ball.x + ball.vx * tHit;
      } else if (side === 1 && ball.vz > 0) {
        tHit = (ARENA_HALF - ball.z) / ball.vz;
        pos = ball.x + ball.vx * tHit;
      } else if (side === 2 && ball.vx < 0) {
        tHit = (-ARENA_HALF - ball.x) / ball.vx;
        pos = ball.z + ball.vz * tHit;
      } else if (side === 3 && ball.vx > 0) {
        tHit = (ARENA_HALF - ball.x) / ball.vx;
        pos = ball.z + ball.vz * tHit;
      }
      if (tHit >= 0 && tHit < bestT) {
        bestT = tHit;
        best = pos;
      }
    }
    return clamp(best, -PADDLE_RANGE, PADDLE_RANGE);
  }

  private checkWin(): void {
    const alive = [...this.players.values()].filter((p) => p.alive);
    if (this.players.size >= 2 && alive.length <= 1) {
      this.ended = true;
      const winner = alive[0] ?? this.topByPoints();
      this.winnerId = winner ? winner.id : null;
      if (winner) this.events.push({ kind: "win", playerId: winner.id });
    }
  }

  private topByPoints(): SimPlayer | undefined {
    let best: SimPlayer | undefined;
    for (const p of this.players.values()) if (!best || p.points > best.points) best = p;
    return best;
  }

  /** Placement (1 = winner) by alive-then-points, for the end screen. */
  ranking(): string[] {
    return [...this.players.values()]
      .sort((a, b) => Number(b.alive) - Number(a.alive) || b.points - a.points)
      .map((p) => p.id);
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function randomSkill(): BotSkill {
  return {
    react: 0.08 + Math.random() * 0.18,
    err: 0.5 + Math.random() * 1.7,
    speed: 0.68 + Math.random() * 0.24,
  };
}
