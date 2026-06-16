import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

/**
 * Third-person camera. OrbitControls provides user-controlled orbit/zoom (drag
 * to rotate, scroll to zoom); on top of that the rig follows a moving target by
 * translating both the camera and the orbit pivot by the same smoothed delta,
 * which preserves the orbit offset while tracking the character.
 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;

  private readonly smoothedTarget = new THREE.Vector3(0, 1, 0);
  private readonly tmp = new THREE.Vector3();
  private readonly delta = new THREE.Vector3();

  constructor(domElement: HTMLElement, aspect: number) {
    this.camera = new THREE.PerspectiveCamera(55, aspect, 0.1, 200);
    this.camera.position.set(0, 4, 9);

    this.controls = new OrbitControls(this.camera, domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.minDistance = 4;
    this.controls.maxDistance = 18;
    // Keep the camera above the ground.
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.target.set(0, 1, 0);
    this.controls.update();
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Snap the rig to a target immediately (e.g. on spawn), no smoothing. */
  snapTo(target: THREE.Vector3): void {
    this.tmp.set(target.x, target.y + 1, target.z);
    this.delta.copy(this.tmp).sub(this.controls.target);
    this.controls.target.add(this.delta);
    this.camera.position.add(this.delta);
    this.smoothedTarget.copy(this.tmp);
    this.controls.update();
  }

  /** Smoothly follow a moving target, preserving the user's orbit offset. */
  follow(target: THREE.Vector3): void {
    this.tmp.set(target.x, target.y + 1, target.z);
    this.smoothedTarget.lerp(this.tmp, 0.15);
    this.delta.copy(this.smoothedTarget).sub(this.controls.target);
    this.controls.target.add(this.delta);
    this.camera.position.add(this.delta);
  }

  /** Camera-relative forward direction projected on the ground plane. */
  getForward(out: THREE.Vector3): THREE.Vector3 {
    this.camera.getWorldDirection(out);
    out.y = 0;
    return out.normalize();
  }

  update(): void {
    this.controls.update();
  }

  dispose(): void {
    this.controls.dispose();
  }
}
