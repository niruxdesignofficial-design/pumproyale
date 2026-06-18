import RAPIER from "@dimforge/rapier3d-compat";
import { SOCCER, footballMap, type GoalZone, type MinigameMap } from "@party-royale/shared";
import type { BotPlan, IMinigame, MinigameContext } from "../IMinigame";
import type { EntityState } from "../../rooms/schema";
import { buildMapColliders, removeColliders } from "../mapColliders";

const BALL_R = 0.5;
const KICK_RANGE = 2.0;
/** Charged kick: a tap is a soft pass, a held button builds toward a hard shot. */
const KICK_MIN = 8;
const KICK_MAX = 22;
const KICK_UP = 3.0;
/** Seconds of holding to reach full power (also the auto-fire cap). */
const CHARGE_MAX = 0.7;
/** Brief lockout after a kick so you cannot instantly re-kick the same ball. */
const KICK_COOLDOWN = 0.25;
const MAX_BALL_SPEED = 28;

/** Enemy goal z for a team (team 0 Blue attacks +z, team 1 Red attacks -z). */
function enemyGoalZ(team: number): number {
  return team === 0 ? SOCCER.halfZ : -SOCCER.halfZ;
}
function ownGoalZ(team: number): number {
  return team === 0 ? -SOCCER.halfZ : SOCCER.halfZ;
}

/**
 * 2v2 soccer. Team 0 (Blue) defends -z, team 1 (Red) defends +z. The ball in a
 * team's own net scores for the OTHER team (own goals included). Both teammates
 * share the team score, so they get equal points. A realistic ball + a tall
 * invisible wall keep play contained. Most team goals in 35s wins the round.
 */
export class FootballMinigame implements IMinigame {
  readonly id = "football";
  readonly name = "Soccer Scramble";
  readonly maxDuration = 15;

  private map: MinigameMap = footballMap();
  private colliders: RAPIER.Collider[] = [];
  private ballBody: RAPIER.RigidBody | null = null;
  private ballCollider: RAPIER.Collider | null = null;
  private ballEntity: EntityState | null = null;
  private resetTimer = 0;
  private elapsed = 0;
  private readonly teamGoals = [0, 0];
  /** Per-player kick charge (s held near the ball) + held-last-tick + cooldown. */
  private readonly charge = new Map<string, number>();
  private readonly wasHeld = new Map<string, boolean>();
  private readonly kickCd = new Map<string, number>();

  setup(ctx: MinigameContext): void {
    this.elapsed = 0;
    this.resetTimer = 0;
    this.teamGoals[0] = 0;
    this.teamGoals[1] = 0;
    this.charge.clear();
    this.wasHeld.clear();
    this.kickCd.clear();
    this.map = footballMap();
    ctx.state.minigame = this.name;
    ctx.setPlatformEnabled(false);
    this.colliders = buildMapColliders(ctx.physics, this.map);

    const ids = ctx.players();
    this.map.spawns.forEach((s, i) => {
      const id = ids[i];
      if (!id) return;
      const sim = ctx.sims.get(id);
      sim?.respawn(s);
      const team = i % 2;
      const p = ctx.state.players.get(id);
      if (p) p.team = team;
      sim?.setFacing(0, team === 0 ? 1 : -1); // face the enemy half
    });

    const world = ctx.physics.world;
    this.ballBody = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(0, BALL_R + 0.2, 0)
        .setLinearDamping(0.12)
        .setAngularDamping(0.2)
        .setCcdEnabled(true),
    );
    this.ballCollider = world.createCollider(
      RAPIER.ColliderDesc.ball(BALL_R).setRestitution(0.55).setFriction(0.5).setDensity(0.7),
      this.ballBody,
    );
    this.ballEntity = ctx.addEntity("ball", 1);
  }

  update(ctx: MinigameContext, dt: number): void {
    this.elapsed += dt;
    const body = this.ballBody;
    const ball = this.ballEntity;
    if (!body || !ball) return;

    if (this.resetTimer > 0) {
      this.resetTimer -= dt;
      if (this.resetTimer <= 0) this.resetBall();
    }

    // Speed cap (anti-tunnel).
    const lv = body.linvel();
    const speed = Math.hypot(lv.x, lv.y, lv.z);
    if (speed > MAX_BALL_SPEED) {
      const k = MAX_BALL_SPEED / speed;
      body.setLinvel({ x: lv.x * k, y: lv.y * k, z: lv.z * k }, true);
    }

    const bp = body.translation();

    // Players push by contact; kicks fling the ball in their AIM direction with
    // charged power: a tap is a soft pass, holding builds toward a hard shot
    // (auto-firing at full charge so bots, who hold near the ball, still shoot).
    for (const id of ctx.players()) {
      const sim = ctx.sims.get(id);
      if (!sim) continue;
      const p = sim.position;
      const dist = Math.hypot(bp.x - p.x, bp.z - p.z);
      const near = dist <= KICK_RANGE;
      const held = ctx.actionHeld(id);
      const prevHeld = this.wasHeld.get(id) ?? false;
      let cd = (this.kickCd.get(id) ?? 0) - dt;
      let c = this.charge.get(id) ?? 0;

      if (cd <= 0 && near && held) {
        c = Math.min(CHARGE_MAX, c + dt);
        if (c >= CHARGE_MAX) {
          this.kick(body, ctx, id, c);
          c = 0;
          cd = KICK_COOLDOWN;
        }
      } else if (cd <= 0 && near && prevHeld && !held) {
        // Released next to the ball: kick with the power built up so far.
        this.kick(body, ctx, id, c);
        c = 0;
        cd = KICK_COOLDOWN;
      } else if (!held) {
        c = 0;
      }

      this.charge.set(id, c);
      this.wasHeld.set(id, held);
      this.kickCd.set(id, Math.max(0, cd));
    }

    // Goals: the ball in a team's net scores for the OTHER team.
    if (this.resetTimer <= 0 && this.map.goals) {
      for (const g of this.map.goals) {
        if (!inZone(bp, g)) continue;
        const scoringTeam = 1 - g.owner;
        this.teamGoals[scoringTeam] = (this.teamGoals[scoringTeam] ?? 0) + 1;
        this.applyTeamScores(ctx);
        ctx.setBanner(
          `GOAL!   Blue ${this.teamGoals[0]}  -  ${this.teamGoals[1]} Red`,
        );
        this.resetTimer = 1.2;
        body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        break;
      }
    }

    if (bp.y < this.map.killY) this.resetBall();

    ball.x = bp.x;
    ball.y = bp.y;
    ball.z = bp.z;

    for (const id of ctx.players()) {
      const sim = ctx.sims.get(id);
      if (sim && sim.position.y < this.map.killY) {
        const i = ctx.players().indexOf(id);
        sim.respawn(this.map.spawns[i % this.map.spawns.length]);
      }
    }
  }

  private applyTeamScores(ctx: MinigameContext): void {
    for (const id of ctx.players()) {
      const p = ctx.state.players.get(id);
      if (p && (p.team === 0 || p.team === 1)) ctx.setScore(id, this.teamGoals[p.team] ?? 0);
    }
  }

  /** Apply a charged kick impulse along the player's aim (camera for humans). */
  private kick(body: RAPIER.RigidBody, ctx: MinigameContext, id: string, charge: number): void {
    const a = ctx.aim(id);
    const t = Math.min(1, charge / CHARGE_MAX);
    const power = KICK_MIN + t * (KICK_MAX - KICK_MIN);
    const up = KICK_UP * (0.7 + t * 0.6);
    body.applyImpulse({ x: a.x * power, y: up, z: a.z * power }, true);
    ctx.sims.get(id)?.triggerShoot();
  }

  private resetBall(): void {
    if (!this.ballBody) return;
    this.ballBody.setTranslation({ x: 0, y: BALL_R + 0.2, z: 0 }, true);
    this.ballBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.ballBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.resetTimer = 0;
  }

  isComplete(): boolean {
    return this.elapsed >= this.maxDuration;
  }

  teardown(ctx: MinigameContext): void {
    removeColliders(ctx.physics, this.colliders);
    this.colliders = [];
    if (this.ballCollider) ctx.physics.world.removeCollider(this.ballCollider, false);
    if (this.ballBody) ctx.physics.world.removeRigidBody(this.ballBody);
    this.ballBody = null;
    this.ballCollider = null;
    this.ballEntity = null;
    ctx.setPlatformEnabled(true);
  }

  /** Smart soccer bot: line up behind the ball, then charge it toward the goal. */
  botPlan(id: string, ctx: MinigameContext): BotPlan {
    const sim = ctx.sims.get(id);
    const bp = this.ballBody?.translation();
    const team = ctx.state.players.get(id)?.team ?? 0;
    if (!sim || !bp) return { tx: 0, tz: 0 };
    const p = sim.position;
    const eGoal = enemyGoalZ(team);
    const oGoal = ownGoalZ(team);

    const ballDist = Math.hypot(bp.x - p.x, bp.z - p.z);
    const support = ctx.botIndex(id) % 2 === 1;

    // Keeper: one bot guards its own goal mouth, tracking the ball's x and
    // clearing it when it gets close. (Makes soccer feel like a real match.)
    if (support) {
      const gx = Math.max(-SOCCER.goalHalf + 0.5, Math.min(SOCCER.goalHalf - 0.5, bp.x));
      const guardZ = oGoal + (team === 0 ? 1.8 : -1.8);
      return { tx: gx, tz: guardZ, action: ballDist <= KICK_RANGE + 0.3 };
    }

    // Direction from the ball toward the goal mouth (x = 0).
    const tgx = 0 - bp.x;
    const tgz = eGoal - bp.z;
    const gl = Math.hypot(tgx, tgz) || 1;
    const ngx = tgx / gl;
    const ngz = tgz / gl;

    // Are we already behind the ball (on the side away from the goal)? If so,
    // charge THROUGH the ball toward the goal (kicking sends it goalward).
    const bx = bp.x - p.x;
    const bz = bp.z - p.z;
    const bl = Math.hypot(bx, bz) || 1;
    const aligned = (bx / bl) * ngx + (bz / bl) * ngz > 0.35;
    if (aligned) {
      return { tx: 0, tz: eGoal, action: ballDist <= KICK_RANGE + 0.3 };
    }
    // Otherwise circle to the spot behind the ball relative to the goal.
    return { tx: bp.x - ngx * 1.8, tz: bp.z - ngz * 1.8 };
  }
}

function inZone(p: RAPIER.Vector, g: GoalZone): boolean {
  return (
    Math.abs(p.x - g.x) <= g.hx && Math.abs(p.y - g.y) <= g.hy && Math.abs(p.z - g.z) <= g.hz
  );
}
