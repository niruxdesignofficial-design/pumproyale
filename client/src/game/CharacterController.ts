import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import type { AnimationState } from "@party-royale/shared";
import type { Character } from "./Character";
import { FIXED_STEP, type PhysicsWorld } from "../physics/PhysicsWorld";

const CAPSULE_RADIUS = 0.3;
const CAPSULE_HALF_HEIGHT = 0.5; // cylinder section half-height
/** Distance from capsule center to its feet. */
const FOOT_OFFSET = CAPSULE_HALF_HEIGHT + CAPSULE_RADIUS;
/** Ground ray reaches slightly past the feet. */
const GROUND_RAY = FOOT_OFFSET + 0.12;

const WALK_SPEED = 5;
const RUN_SPEED = 8.5;
const JUMP_SPEED = 9.5;
const AIR_CONTROL = 0.12;

const DIVE_SPEED = 12;
const DIVE_UP = 4;
const DIVE_DURATION = 0.55;

const KNOCK_UP = 5;
const KNOCK_CONTROL_LOCK = 0.4;

/** Below this Y the character has fallen off and respawns. */
const FALL_Y = -8;

/** Rotate the model if its authored forward axis is not +Z. */
const MODEL_YAW_OFFSET = Math.PI;

export interface ControllerInput {
  /** World-space, camera-relative move direction (not normalized). */
  moveX: number;
  moveZ: number;
  run: boolean;
  jump: boolean;
  dive: boolean;
}

/**
 * Dynamic capsule controller. The rigid body has locked rotations; horizontal
 * velocity is driven directly from input on the ground and blended in the air,
 * while gravity, jumps, dives, and bumper knockback flow through the physics
 * solver so collisions and knockback behave naturally.
 */
export class CharacterController {
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  readonly position = new THREE.Vector3();

  private readonly spawn: THREE.Vector3;
  private input: ControllerInput = { moveX: 0, moveZ: 0, run: false, jump: false, dive: false };
  private prevJump = false;
  private prevDive = false;
  private jumpQueued = false;
  private diveQueued = false;

  private grounded = false;
  private diving = false;
  private diveTimer = 0;
  private knockLock = 0;

  private currentYaw = 0;
  private readonly lastFacing = new THREE.Vector3(0, 0, 1);

  constructor(
    private readonly physics: PhysicsWorld,
    private readonly character: Character,
    spawn: THREE.Vector3,
  ) {
    this.spawn = spawn.clone();
    const world = physics.world;

    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(spawn.x, spawn.y, spawn.z)
      .lockRotations()
      .setLinearDamping(0.05)
      .setCcdEnabled(true);
    this.body = world.createRigidBody(bodyDesc);

    const colDesc = RAPIER.ColliderDesc.capsule(CAPSULE_HALF_HEIGHT, CAPSULE_RADIUS)
      .setFriction(0.4)
      .setRestitution(0);
    this.collider = world.createCollider(colDesc, this.body);

    this.position.copy(spawn);
    this.syncMesh(0);
  }

  /** Called once per render frame with the latest input. Detects press edges. */
  setInput(input: ControllerInput): void {
    this.input = input;
    if (input.jump && !this.prevJump) this.jumpQueued = true;
    if (input.dive && !this.prevDive) this.diveQueued = true;
    this.prevJump = input.jump;
    this.prevDive = input.dive;
  }

  /** Fixed-rate physics update; runs immediately before each world step. */
  fixedUpdate(): void {
    const center = this.body.translation();
    this.grounded = this.physics.groundCheck(center, GROUND_RAY, this.collider);

    if (this.knockLock > 0) this.knockLock -= FIXED_STEP;
    if (this.diving) {
      this.diveTimer -= FIXED_STEP;
      if (this.diveTimer <= 0) this.diving = false;
    }

    const v = this.body.linvel();
    const controlled = this.knockLock <= 0 && !this.diving;

    if (controlled) {
      const dir = this.moveDir();
      const speed = this.input.run ? RUN_SPEED : WALK_SPEED;
      const desiredX = dir.x * speed;
      const desiredZ = dir.z * speed;

      let nx: number;
      let nz: number;
      if (this.grounded) {
        nx = desiredX;
        nz = desiredZ;
      } else {
        nx = v.x + (desiredX - v.x) * AIR_CONTROL;
        nz = v.z + (desiredZ - v.z) * AIR_CONTROL;
      }
      this.body.setLinvel({ x: nx, y: v.y, z: nz }, true);

      if (dir.lengthSq() > 0.0001) this.lastFacing.set(dir.x, 0, dir.z).normalize();
    }

    // Jump (buffered until grounded).
    if (this.jumpQueued && this.grounded && this.knockLock <= 0 && !this.diving) {
      const cur = this.body.linvel();
      this.body.setLinvel({ x: cur.x, y: JUMP_SPEED, z: cur.z }, true);
      this.jumpQueued = false;
    }

    // Dive: forward lunge from the ground.
    if (this.diveQueued && this.grounded && !this.diving && this.knockLock <= 0) {
      this.diving = true;
      this.diveTimer = DIVE_DURATION;
      this.body.setLinvel(
        { x: this.lastFacing.x * DIVE_SPEED, y: DIVE_UP, z: this.lastFacing.z * DIVE_SPEED },
        true,
      );
    }
    this.diveQueued = false;

    if (this.body.translation().y < FALL_Y) this.respawn();
  }

  /** Per render frame: sync the visual mesh, facing, and animation state. */
  update(dt: number): void {
    this.syncMesh(dt);
    this.character.setState(this.computeAnimState());
  }

  /** Radial knockback from a bumper. dirX/dirZ should be a unit vector. */
  applyKnockback(dirX: number, dirZ: number, strength: number): void {
    this.body.setLinvel({ x: dirX * strength, y: KNOCK_UP, z: dirZ * strength }, true);
    this.knockLock = KNOCK_CONTROL_LOCK;
    this.diving = false;
  }

  private respawn(): void {
    this.body.setTranslation(this.spawn, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.diving = false;
    this.knockLock = 0;
  }

  private moveDir(): THREE.Vector3 {
    const d = new THREE.Vector3(this.input.moveX, 0, this.input.moveZ);
    if (d.lengthSq() > 1) d.normalize();
    return d;
  }

  private syncMesh(dt: number): void {
    const t = this.body.translation();
    this.position.set(t.x, t.y, t.z);
    this.character.object3d.position.set(t.x, t.y - FOOT_OFFSET, t.z);

    const v = this.body.linvel();
    const horizSpeed = Math.hypot(v.x, v.z);
    if (horizSpeed > 0.5) {
      const targetYaw = Math.atan2(v.x, v.z) + MODEL_YAW_OFFSET;
      const blend = dt > 0 ? Math.min(1, dt * 12) : 1;
      this.currentYaw = lerpAngle(this.currentYaw, targetYaw, blend);
    }
    this.character.object3d.rotation.y = this.currentYaw;
  }

  private computeAnimState(): AnimationState {
    if (this.diving) return "dive";
    const v = this.body.linvel();
    if (!this.grounded) return v.y > 0.5 ? "jump" : "fall";
    return Math.hypot(v.x, v.z) > 0.6 ? "run" : "idle";
  }
}

/** Shortest-path angular interpolation (radians). */
function lerpAngle(a: number, b: number, t: number): number {
  let diff = (b - a) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}
