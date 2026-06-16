import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import type { PhysicsWorld } from "../../physics/PhysicsWorld";
import type { CharacterController } from "../CharacterController";

const HEIGHT = 1.4;
const KNOCK_STRENGTH = 13;
const TRIGGER_PAD = 0.45; // extra reach so the bump fires on contact
const COOLDOWN = 0.5;
const PULSE_TIME = 0.18;

/**
 * Greybox bumper: a static cylinder the character collides with, plus a radial
 * knockback that flings the player outward on contact (Fall Guys style). This is
 * a primitive placeholder; it can be swapped for a KayKit Prototype Bits /
 * Platformer model later without changing the knockback logic.
 */
export class Bumper {
  readonly mesh: THREE.Mesh;
  private readonly center: THREE.Vector3;
  private readonly radius: number;
  private readonly baseColor = new THREE.Color(0xff5d73);
  private readonly hitColor = new THREE.Color(0xffd166);
  private readonly material: THREE.MeshStandardMaterial;
  private cooldown = 0;
  private pulse = 0;

  constructor(physics: PhysicsWorld, position: THREE.Vector3, radius = 1) {
    this.center = position.clone();
    this.radius = radius;

    this.material = new THREE.MeshStandardMaterial({
      color: this.baseColor,
      roughness: 0.5,
      emissive: 0x220008,
    });
    this.mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, HEIGHT, 24), this.material);
    this.mesh.position.set(position.x, HEIGHT / 2, position.z);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;

    // Static collider so the capsule physically collides with the bumper.
    const colDesc = RAPIER.ColliderDesc.cylinder(HEIGHT / 2, radius)
      .setTranslation(position.x, HEIGHT / 2, position.z)
      .setRestitution(0.3);
    physics.world.createCollider(colDesc);
  }

  update(dt: number, controller: CharacterController): void {
    if (this.cooldown > 0) this.cooldown -= dt;

    if (this.pulse > 0) {
      this.pulse -= dt;
      const k = Math.max(0, this.pulse / PULSE_TIME);
      this.material.color.copy(this.baseColor).lerp(this.hitColor, k);
      const s = 1 + 0.18 * k;
      this.mesh.scale.set(s, 1, s);
    }

    if (this.cooldown > 0) return;

    const p = controller.position;
    const dx = p.x - this.center.x;
    const dz = p.z - this.center.z;
    const dist = Math.hypot(dx, dz);
    if (dist <= this.radius + TRIGGER_PAD) {
      const inv = dist > 1e-4 ? 1 / dist : 0;
      const nx = inv === 0 ? 1 : dx * inv;
      const nz = inv === 0 ? 0 : dz * inv;
      controller.applyKnockback(nx, nz, KNOCK_STRENGTH);
      this.cooldown = COOLDOWN;
      this.pulse = PULSE_TIME;
    }
  }
}
