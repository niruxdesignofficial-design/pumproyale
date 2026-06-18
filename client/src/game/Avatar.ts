import * as THREE from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { CLIP_NAMES, FOOT_OFFSET, type AnimationState } from "@party-royale/shared";
import { getCharacterGltf, getClips } from "./characterModel";

// KayKit Adventurers are authored facing +Z, matching the server's
// yaw = atan2(vx, vz), so no extra offset is needed (this fixes the old
// "faces the camera when running forward" bug from the PrototypePete model).
const MODEL_YAW_OFFSET = 0;
const POS_LERP = 0.25;
const YAW_LERP = 0.3;

/**
 * A rendered player: a cloned Adventurer driven by the shared Rig_Medium clips,
 * with a colored ground ring to tell players apart, interpolated toward the
 * authoritative server transforms.
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
  private ringMat: THREE.MeshBasicMaterial | null = null;
  private readonly disposables: { dispose(): void }[] = [];

  private emoteSprite: THREE.Sprite | null = null;
  private emoteText = "";
  private youArrow: THREE.Mesh | null = null;
  private bob = 0;

  constructor(characterId: string, ringColor: number, name = "") {
    const gltf = getCharacterGltf(characterId);
    if (gltf) {
      const model = cloneSkeleton(gltf.scene);
      const tint = new THREE.Color(ringColor);
      model.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          // Vivid per-player team color: clone materials and push toward the tint.
          const m = mesh.material;
          mesh.material = Array.isArray(m)
            ? m.map((x) => this.tintMaterial(x, tint))
            : this.tintMaterial(m, tint);
        }
      });
      this.object3d.add(model);
      this.clips = getClips();
      this.mixer = new THREE.AnimationMixer(model);
      this.setAnim("idle");
    } else {
      this.buildFallback(ringColor);
    }
    this.addRing(ringColor);
    this.addContactShadow();
    if (name) this.addNameTag(name, ringColor);
  }

  /** Mark this as the local player: a bobbing arrow + a brighter ground ring. */
  setLocal(): void {
    this.ringMat?.color.set(0x3df089);
    if (this.ringMat) this.ringMat.opacity = 1;
    const geo = new THREE.ConeGeometry(0.22, 0.4, 4);
    const mat = new THREE.MeshBasicMaterial({ color: 0x3df089, depthTest: false });
    const arrow = new THREE.Mesh(geo, mat);
    arrow.rotation.z = Math.PI; // point down
    arrow.position.y = 2.7;
    arrow.renderOrder = 998;
    this.object3d.add(arrow);
    this.youArrow = arrow;
    this.disposables.push(geo, mat);
  }

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
    if (this.youArrow) {
      this.bob += dt * 4;
      this.youArrow.position.y = 2.7 + Math.sin(this.bob) * 0.12;
    }
    this.mixer?.update(dt);
  }

  get position(): THREE.Vector3 {
    return this.object3d.position;
  }

  setEliminated(eliminated: boolean): void {
    this.object3d.visible = !eliminated;
  }

  /** Recolor the ground ring (used to show team color during team rounds). */
  setRingColor(color: number): void {
    this.ringMat?.color.set(color);
  }

  /** Show a short text emote bubble above the head ("" hides it). */
  setEmote(text: string): void {
    if (text === this.emoteText) return;
    this.emoteText = text;
    if (this.emoteSprite) {
      this.object3d.remove(this.emoteSprite);
      this.emoteSprite.material.map?.dispose();
      this.emoteSprite.material.dispose();
      this.emoteSprite = null;
    }
    if (!text) return;
    const sprite = makeEmoteSprite(text);
    sprite.position.y = 2.3;
    this.object3d.add(sprite);
    this.emoteSprite = sprite;
  }

  dispose(): void {
    this.mixer?.stopAllAction();
    if (this.emoteSprite) {
      this.emoteSprite.material.map?.dispose();
      this.emoteSprite.material.dispose();
      this.emoteSprite = null;
    }
    for (const d of this.disposables) d.dispose();
    this.object3d.clear();
  }

  private tintMaterial(material: THREE.Material, tint: THREE.Color): THREE.Material {
    const cloned = material.clone();
    const std = cloned as THREE.MeshStandardMaterial;
    // Keep the KayKit texture detail; nudge toward the team color for identity.
    if (std.color) std.color.lerp(tint, 0.4);
    this.disposables.push(cloned);
    return cloned;
  }

  private addRing(color: number): void {
    const geo = new THREE.RingGeometry(0.32, 0.46, 28);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(geo, mat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    this.object3d.add(ring);
    this.ringMat = mat;
    this.disposables.push(geo, mat);
  }

  /** Soft dark blob under the feet so the character reads as sitting on the ground. */
  private addContactShadow(): void {
    const tex = makeRadialTexture("rgba(0,0,0,0.5)");
    const geo = new THREE.PlaneGeometry(1.5, 1.5);
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      opacity: 0.55,
    });
    const blob = new THREE.Mesh(geo, mat);
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.02;
    this.object3d.add(blob);
    this.disposables.push(geo, mat, tex);
  }

  /** A floating name tag above the head (always faces the camera). */
  private addNameTag(name: string, color: number): void {
    const sprite = makeNameSprite(name, color);
    sprite.position.y = 2.05;
    this.object3d.add(sprite);
    this.disposables.push(sprite.material, sprite.material.map as THREE.Texture);
  }

  private buildFallback(color: number): void {
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
    const bodyGeo = new THREE.CapsuleGeometry(0.3, 0.7, 6, 16);
    const body = new THREE.Mesh(bodyGeo, mat);
    body.position.y = 0.8;
    body.castShadow = true;
    const headGeo = new THREE.SphereGeometry(0.26, 20, 14);
    const head = new THREE.Mesh(headGeo, mat);
    head.position.y = 1.5;
    head.castShadow = true;
    this.object3d.add(body, head);
    this.disposables.push(bodyGeo, headGeo, mat);
  }

  private resolveClip(state: AnimationState): THREE.AnimationClip | null {
    const target = CLIP_NAMES[state];
    const exact = this.clips.find((c) => c.name === target);
    if (exact) return exact;
    const lower = target.toLowerCase();
    return this.clips.find((c) => c.name.toLowerCase().includes(lower)) ?? null;
  }
}

/** A soft radial gradient texture (used for the contact shadow blob). */
function makeRadialTexture(inner: string): THREE.CanvasTexture {
  const S = 128;
  const canvas = document.createElement("canvas");
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, inner);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  return new THREE.CanvasTexture(canvas);
}

/** A camera-facing name tag sprite (colored pill + the player's name). */
function makeNameSprite(name: string, color: number): THREE.Sprite {
  const W = 256;
  const H = 64;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "rgba(8,16,12,0.72)";
  roundRect(ctx, 6, 12, W - 12, 40, 20);
  ctx.fill();
  const hex = `#${color.toString(16).padStart(6, "0")}`;
  ctx.fillStyle = hex;
  roundRect(ctx, 6, 12, 10, 40, 5);
  ctx.fill();
  ctx.fillStyle = "#eaf6ee";
  ctx.font = "bold 30px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(name.slice(0, 12), W / 2 + 4, 33);
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1.7, 0.42, 1);
  sprite.renderOrder = 997;
  return sprite;
}

/** Build a camera-facing speech-bubble sprite for a short emote word. */
function makeEmoteSprite(text: string): THREE.Sprite {
  const W = 256;
  const H = 128;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  // Rounded white bubble with a little tail.
  ctx.fillStyle = "rgba(255,255,255,0.96)";
  roundRect(ctx, 16, 12, W - 32, 80, 22);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(W / 2 - 16, 90);
  ctx.lineTo(W / 2 + 16, 90);
  ctx.lineTo(W / 2, 116);
  ctx.closePath();
  ctx.fill();
  // The word.
  ctx.fillStyle = "#2a2350";
  ctx.font = "bold 52px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, W / 2, 52);

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1.6, 0.8, 1);
  sprite.renderOrder = 999;
  return sprite;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function lerpAngle(a: number, b: number, t: number): number {
  let diff = (b - a) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}
