import RAPIER from "@dimforge/rapier3d-compat";
import {
  ARENA,
  FOOT_OFFSET,
  PHYS,
  type AnimationState,
  type InputIntent,
} from "@party-royale/shared";
import type { PhysicsWorld } from "./PhysicsWorld";

const GROUND_RAY = FOOT_OFFSET + 0.12;
const MODEL_FACE_EPS = 0.5;

/**
 * Authoritative per-player simulation. Mirrors the Phase 2 client controller but
 * runs on the server with no rendering dependency. The server applies the
 * latest input each tick; clients never set position directly.
 */
export class PlayerSim {
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;

  private input: InputIntent = { moveX: 0, moveZ: 0, run: false, jump: false, dive: false, seq: 0 };
  private prevJump = false;
  private prevDive = false;
  private jumpQueued = false;
  private diveQueued = false;

  private grounded = false;
  private diving = false;
  private diveTimer = 0;
  private knockLock = 0;
  bumperCooldown = 0;

  private faceX = 0;
  private faceZ = 1;
  yaw = 0;

  /** True once the player has fallen off (used by elimination logic in Phase 4). */
  fellOff = false;

  constructor(
    private readonly physics: PhysicsWorld,
    private spawn: { x: number; y: number; z: number },
  ) {
    const world = physics.world;
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(spawn.x, spawn.y, spawn.z)
      .lockRotations()
      .setLinearDamping(0.05)
      .setCcdEnabled(true);
    this.body = world.createRigidBody(bodyDesc);

    const colDesc = RAPIER.ColliderDesc.capsule(PHYS.capsuleHalfHeight, PHYS.capsuleRadius)
      .setFriction(0.4)
      .setRestitution(0);
    this.collider = world.createCollider(colDesc, this.body);
  }

  setInput(intent: InputIntent): void {
    this.input = intent;
    if (intent.jump && !this.prevJump) this.jumpQueued = true;
    if (intent.dive && !this.prevDive) this.diveQueued = true;
    this.prevJump = intent.jump;
    this.prevDive = intent.dive;
  }

  /** Apply input/velocities. Call before world.step(). */
  preStep(dt: number): void {
    const center = this.body.translation();
    this.grounded = this.physics.groundCheck(center, GROUND_RAY, this.collider);

    if (this.knockLock > 0) this.knockLock -= dt;
    if (this.bumperCooldown > 0) this.bumperCooldown -= dt;
    if (this.diving) {
      this.diveTimer -= dt;
      if (this.diveTimer <= 0) this.diving = false;
    }

    const v = this.body.linvel();
    const controlled = this.knockLock <= 0 && !this.diving;

    if (controlled) {
      let dx = this.input.moveX;
      let dz = this.input.moveZ;
      const len = Math.hypot(dx, dz);
      if (len > 1) {
        dx /= len;
        dz /= len;
      }
      const speed = this.input.run ? PHYS.runSpeed : PHYS.walkSpeed;
      const desiredX = dx * speed;
      const desiredZ = dz * speed;

      let nx: number;
      let nz: number;
      if (this.grounded) {
        nx = desiredX;
        nz = desiredZ;
      } else {
        nx = v.x + (desiredX - v.x) * PHYS.airControl;
        nz = v.z + (desiredZ - v.z) * PHYS.airControl;
      }
      this.body.setLinvel({ x: nx, y: v.y, z: nz }, true);

      if (len > 0.0001) {
        this.faceX = dx;
        this.faceZ = dz;
      }
    }

    if (this.jumpQueued && this.grounded && this.knockLock <= 0 && !this.diving) {
      const cur = this.body.linvel();
      this.body.setLinvel({ x: cur.x, y: PHYS.jumpSpeed, z: cur.z }, true);
      this.jumpQueued = false;
    }

    if (this.diveQueued && this.grounded && !this.diving && this.knockLock <= 0) {
      this.diving = true;
      this.diveTimer = PHYS.diveDuration;
      this.body.setLinvel(
        { x: this.faceX * PHYS.diveSpeed, y: PHYS.diveUp, z: this.faceZ * PHYS.diveSpeed },
        true,
      );
    }
    this.diveQueued = false;
  }

  /** Update facing and detect fall-off. Call after world.step(). */
  postStep(): void {
    const v = this.body.linvel();
    if (Math.hypot(v.x, v.z) > MODEL_FACE_EPS) {
      this.yaw = Math.atan2(v.x, v.z);
    }
    if (this.body.translation().y < ARENA.fallY) {
      this.fellOff = true;
    }
  }

  applyKnockback(dirX: number, dirZ: number, strength: number): void {
    this.body.setLinvel({ x: dirX * strength, y: PHYS.knockUp, z: dirZ * strength }, true);
    this.knockLock = PHYS.knockControlLock;
    this.bumperCooldown = PHYS.bumperCooldown;
    this.diving = false;
  }

  respawn(spawn?: { x: number; y: number; z: number }): void {
    if (spawn) this.spawn = spawn;
    this.body.setTranslation(this.spawn, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.diving = false;
    this.knockLock = 0;
    this.fellOff = false;
  }

  get position(): RAPIER.Vector {
    return this.body.translation();
  }

  animState(): AnimationState {
    if (this.diving) return "dive";
    const v = this.body.linvel();
    if (!this.grounded) return v.y > 0.5 ? "jump" : "fall";
    return Math.hypot(v.x, v.z) > 0.6 ? "run" : "idle";
  }

  destroy(): void {
    this.physics.world.removeRigidBody(this.body);
  }
}
