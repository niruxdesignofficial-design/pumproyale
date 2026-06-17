import RAPIER from "@dimforge/rapier3d-compat";
import { PHYS, footballMap, type GoalZone, type MinigameMap } from "@party-royale/shared";
import type { IMinigame, MinigameContext } from "../IMinigame";
import type { EntityState } from "../../rooms/schema";
import { buildMapColliders, removeColliders } from "../mapColliders";

const BALL_R = 0.55;
const KICK_RANGE = 1.7;
const KICK_POWER = 11;
const TOUCH_PAD = 0.4;

/**
 * Soccer. A dynamic ball you push by running into it and kick with the action
 * button. Putting the ball into either goal scores a point for whoever last
 * touched it. Most goals when time runs out wins the round.
 */
export class FootballMinigame implements IMinigame {
  readonly id = "football";
  readonly name = "Soccer Scramble";
  readonly maxDuration = 50;

  private map: MinigameMap = footballMap();
  private colliders: RAPIER.Collider[] = [];
  private ballBody: RAPIER.RigidBody | null = null;
  private ballCollider: RAPIER.Collider | null = null;
  private ballEntity: EntityState | null = null;
  private lastTouch: string | null = null;
  private resetTimer = 0;
  private elapsed = 0;
  private readonly botKick = new Map<string, number>();

  setup(ctx: MinigameContext): void {
    this.elapsed = 0;
    this.lastTouch = null;
    this.resetTimer = 0;
    this.botKick.clear();
    this.map = footballMap();
    ctx.state.minigame = this.name;
    ctx.setPlatformEnabled(false);
    this.colliders = buildMapColliders(ctx.physics, this.map);

    const world = ctx.physics.world;
    this.ballBody = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(0, BALL_R + 0.1, 0)
        .setLinearDamping(0.55)
        .setAngularDamping(0.6)
        .setCcdEnabled(true),
    );
    this.ballCollider = world.createCollider(
      RAPIER.ColliderDesc.ball(BALL_R).setRestitution(0.45).setFriction(0.7).setDensity(0.5),
      this.ballBody,
    );
    this.ballEntity = ctx.addEntity("ball", 1);

    this.map.spawns.forEach((s, i) => {
      const id = ctx.players()[i];
      if (id) ctx.sims.get(id)?.respawn(s);
    });
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

    const bp = body.translation();

    // Track last toucher and let kicks fling the ball.
    for (const id of ctx.players()) {
      const sim = ctx.sims.get(id);
      if (!sim) continue;
      const p = sim.position;
      const dx = bp.x - p.x;
      const dz = bp.z - p.z;
      const dist = Math.hypot(dx, dz);
      if (dist <= PHYS.capsuleRadius + BALL_R + TOUCH_PAD) this.lastTouch = id;
      if (dist <= KICK_RANGE && ctx.consumeAction(id)) {
        const f = ctx.facing(id);
        body.applyImpulse({ x: f.x * KICK_POWER, y: 3.5, z: f.z * KICK_POWER }, true);
        this.lastTouch = id;
      }
    }

    // Goals.
    if (this.resetTimer <= 0 && this.map.goals) {
      for (const g of this.map.goals) {
        if (inZone(bp, g)) {
          if (this.lastTouch) ctx.addScore(this.lastTouch, 1);
          this.resetTimer = 1.0;
          body.setLinvel({ x: 0, y: 0, z: 0 }, true);
          break;
        }
      }
    }

    // Keep the ball from drifting under the world if it escapes.
    if (bp.y < this.map.killY) this.resetBall();

    ball.x = bp.x;
    ball.y = bp.y;
    ball.z = bp.z;

    // Respawn anyone who falls off the pitch.
    for (const id of ctx.players()) {
      const sim = ctx.sims.get(id);
      if (sim && sim.position.y < this.map.killY) sim.respawn();
    }

    // Bot kick timers tick down.
    for (const [id, t] of this.botKick) this.botKick.set(id, t - dt);
  }

  private resetBall(): void {
    if (!this.ballBody) return;
    this.ballBody.setTranslation({ x: 0, y: BALL_R + 0.1, z: 0 }, true);
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

  botTarget(_id: string): { x: number; z: number } {
    const bp = this.ballBody?.translation();
    return bp ? { x: bp.x, z: bp.z } : { x: 0, z: 0 };
  }

  botAction(id: string, ctx: MinigameContext): boolean {
    const bp = this.ballBody?.translation();
    const sim = ctx.sims.get(id);
    if (!bp || !sim) return false;
    const dist = Math.hypot(bp.x - sim.position.x, bp.z - sim.position.z);
    if (dist > KICK_RANGE) return false;
    if ((this.botKick.get(id) ?? 0) > 0) return false;
    this.botKick.set(id, 0.8);
    return true;
  }
}

function inZone(p: RAPIER.Vector, g: GoalZone): boolean {
  return (
    Math.abs(p.x - g.x) <= g.hx && Math.abs(p.y - g.y) <= g.hy && Math.abs(p.z - g.z) <= g.hz
  );
}
