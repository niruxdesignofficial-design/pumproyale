import * as THREE from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { CLIP_NAMES, FOOT_OFFSET, type AnimationState } from "@party-royale/shared";

const MODEL_YAW_OFFSET = Math.PI;
const POS_LERP = 0.25;
const YAW_LERP = 0.3;

/**
 * A rendered player. Clones the shared KayKit GLTF (or a procedural fallback),
 * drives a per-instance AnimationMixer, and smoothly interpolates toward the
 * authoritative transforms streamed from the server.
 */
export class Avatar {
  readonly object3d = new THREE.Group();

  private mixer: THREE.AnimationMixer | null = null;
  private clips: THREE.AnimationClip[] = [];
  private active: THREE.AnimationAction | null = null;
  private animState: AnimationState = "idle";

  private readonly targetPos = new THREE.Vector3();
  private targetYaw = 0;
  private hasTarget = false;
  private readonly disposables: { dispose(): void }[] = [];

  constructor(gltf: GLTF | null, color: number) {
    if (gltf) {
      this.buildFromGltf(gltf, color);
    } else {
      this.buildFallback(color);
    }
  }

  /** Update the interpolation target from an authoritative server transform. */
  setTarget(x: number, y: number, z: number, yaw: number): void {
    this.targetPos.set(x, y - FOOT_OFFSET, z);
    this.targetYaw = yaw + MODEL_YAW_OFFSET;
    if (!this.hasTarget) {
      this.object3d.position.copy(this.targetPos);
      this.object3d.rotation.y = this.targetYaw;
      this.hasTarget = true;
    }
  }

  setAnim(state: AnimationState): void {
    if (state === this.animState && this.active) return;
    this.animState = state;
    if (!this.mixer) return;

    const clip = this.resolveClip(state);
    if (!clip) return;
    const next = this.mixer.clipAction(clip);
    next.reset();
    next.setLoop(THREE.LoopRepeat, Infinity);
    next.enabled = true;
    next.setEffectiveWeight(1);
    if (this.active && this.active !== next) next.crossFadeFrom(this.active, 0.2, false);
    next.play();
    this.active = next;
  }

  update(dt: number): void {
    if (this.hasTarget) {
      this.object3d.position.lerp(this.targetPos, POS_LERP);
      this.object3d.rotation.y = lerpAngle(this.object3d.rotation.y, this.targetYaw, YAW_LERP);
    }
    this.mixer?.update(dt);
  }

  /** Approximate world position (feet) for the camera to follow. */
  get position(): THREE.Vector3 {
    return this.object3d.position;
  }

  dispose(): void {
    this.mixer?.stopAllAction();
    for (const d of this.disposables) d.dispose();
    this.object3d.clear();
  }

  private buildFromGltf(gltf: GLTF, color: number): void {
    const model = cloneSkeleton(gltf.scene);
    const tint = new THREE.Color(color);
    model.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        // Clone materials so each avatar can be tinted independently.
        const mat = mesh.material;
        if (Array.isArray(mat)) {
          mesh.material = mat.map((m) => this.tintMaterial(m, tint));
        } else {
          mesh.material = this.tintMaterial(mat, tint);
        }
      }
    });
    this.object3d.add(model);
    this.clips = gltf.animations;
    this.mixer = new THREE.AnimationMixer(model);
    this.setAnim("idle");
  }

  private tintMaterial(mat: THREE.Material, tint: THREE.Color): THREE.Material {
    const cloned = mat.clone();
    const std = cloned as THREE.MeshStandardMaterial;
    if (std.color) std.color.lerp(tint, 0.5);
    this.disposables.push(cloned);
    return cloned;
  }

  private buildFallback(color: number): void {
    const skin = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
    const bodyGeo = new THREE.CapsuleGeometry(0.3, 0.7, 6, 16);
    const body = new THREE.Mesh(bodyGeo, skin);
    body.position.y = 0.8;
    body.castShadow = true;
    const headGeo = new THREE.SphereGeometry(0.26, 20, 14);
    const head = new THREE.Mesh(headGeo, skin);
    head.position.y = 1.5;
    head.castShadow = true;
    this.object3d.add(body, head);
    this.disposables.push(bodyGeo, headGeo, skin);
  }

  private resolveClip(state: AnimationState): THREE.AnimationClip | null {
    const target = CLIP_NAMES[state];
    const exact = this.clips.find((c) => c.name === target);
    if (exact) return exact;
    const lower = target.toLowerCase();
    return this.clips.find((c) => c.name.toLowerCase().includes(lower)) ?? null;
  }
}

function lerpAngle(a: number, b: number, t: number): number {
  let diff = (b - a) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}
