import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { CLIP_NAMES, type AnimationState } from "@party-royale/shared";
import { getAsset } from "./AssetManifest";

export interface CharacterLoadResult {
  /** True when the real GLB was missing and the procedural placeholder is shown. */
  usingFallback: boolean;
  /** Label for the HUD. */
  label: string;
}

/**
 * Loads the rigged KayKit character and drives its animation state machine via
 * an AnimationMixer. If the prepared GLB is missing (pipeline not run), it falls
 * back to a simple procedural capsule with a programmatic idle so the scene is
 * never empty.
 *
 * The public API (setState / update / object3d) is uniform across both paths so
 * Phase 2+ controller code does not care which is active.
 */
export class Character {
  readonly object3d = new THREE.Group();

  private mixer: THREE.AnimationMixer | null = null;
  private clips: THREE.AnimationClip[] = [];
  private activeAction: THREE.AnimationAction | null = null;
  private currentState: AnimationState = "idle";

  private usingFallback = false;
  private elapsed = 0;
  private readonly disposables: { dispose(): void }[] = [];

  async load(): Promise<CharacterLoadResult> {
    const asset = getAsset("character.animated");
    try {
      const gltf = await this.loadGltf(asset.url);
      const model = gltf.scene;
      model.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          obj.castShadow = true;
          obj.receiveShadow = true;
        }
      });
      this.object3d.add(model);

      this.clips = gltf.animations;
      this.mixer = new THREE.AnimationMixer(model);
      this.setState("idle");

      return { usingFallback: false, label: asset.label };
    } catch (err) {
      console.warn(
        "[character] could not load",
        asset.url,
        "- using procedural placeholder. Run `pnpm assets:prepare` to load the real model.",
        err,
      );
      this.buildFallback();
      this.usingFallback = true;
      return { usingFallback: true, label: "Placeholder (run assets:prepare)" };
    }
  }

  /** Switch animation state with a short cross-fade (no-op on the fallback). */
  setState(state: AnimationState): void {
    // Already in this state and playing it: nothing to do.
    if (state === this.currentState && this.activeAction) return;
    this.currentState = state;
    if (!this.mixer) return;

    const clip = this.resolveClip(state);
    if (!clip) {
      console.warn("[character] no clip found for state", state);
      return;
    }

    const next = this.mixer.clipAction(clip);
    next.reset();
    next.setLoop(THREE.LoopRepeat, Infinity);
    next.enabled = true;
    next.setEffectiveWeight(1);

    if (this.activeAction && this.activeAction !== next) {
      next.crossFadeFrom(this.activeAction, 0.25, false);
    }
    next.play();
    this.activeAction = next;
  }

  update(dt: number): void {
    this.elapsed += dt;
    if (this.mixer) {
      this.mixer.update(dt);
    } else if (this.usingFallback) {
      // Programmatic idle: gentle vertical bob and sway.
      this.object3d.position.y = Math.sin(this.elapsed * 2) * 0.05;
      this.object3d.rotation.y = Math.sin(this.elapsed * 0.6) * 0.1;
    }
  }

  /** World-space point the camera should orbit (approx. character chest). */
  getFocusPoint(): THREE.Vector3 {
    const box = new THREE.Box3().setFromObject(this.object3d);
    const center = new THREE.Vector3();
    if (box.isEmpty()) return new THREE.Vector3(0, 1, 0);
    box.getCenter(center);
    return center;
  }

  dispose(): void {
    this.mixer?.stopAllAction();
    for (const d of this.disposables) d.dispose();
    this.object3d.clear();
  }

  private resolveClip(state: AnimationState): THREE.AnimationClip | null {
    const target = CLIP_NAMES[state];
    const exact = this.clips.find((c) => c.name === target);
    if (exact) return exact;
    const lower = target.toLowerCase();
    return this.clips.find((c) => c.name.toLowerCase().includes(lower)) ?? null;
  }

  private buildFallback(): void {
    const skin = new THREE.MeshStandardMaterial({ color: 0x6fb1ff, roughness: 0.6 });
    const accent = new THREE.MeshStandardMaterial({ color: 0xffd166, roughness: 0.5 });

    const bodyGeo = new THREE.CapsuleGeometry(0.35, 0.7, 6, 16);
    const body = new THREE.Mesh(bodyGeo, skin);
    body.position.y = 0.9;
    body.castShadow = true;
    body.receiveShadow = true;

    const headGeo = new THREE.SphereGeometry(0.28, 24, 16);
    const head = new THREE.Mesh(headGeo, skin);
    head.position.y = 1.6;
    head.castShadow = true;

    const noseGeo = new THREE.ConeGeometry(0.08, 0.2, 12);
    const nose = new THREE.Mesh(noseGeo, accent);
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 1.6, 0.28);

    this.object3d.add(body, head, nose);
    this.disposables.push(bodyGeo, headGeo, noseGeo, skin, accent);
  }

  private loadGltf(url: string): Promise<GLTF> {
    const loader = new GLTFLoader();
    // DRACO wired but optional: only fetches the decoder if a mesh is compressed.
    // Our Phase 1 asset is uncompressed, so this never activates.
    const draco = new DRACOLoader();
    draco.setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.7/");
    loader.setDRACOLoader(draco);

    return new Promise((resolve, reject) => {
      loader.load(url, resolve, undefined, reject);
    });
  }
}
