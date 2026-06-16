import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

/**
 * Phase 1 camera: a perspective camera with OrbitControls so the character can
 * be inspected from any angle (the "orbit/free camera" acceptance criterion).
 * Phase 2 replaces this with a smoothed third-person follow rig.
 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;

  constructor(domElement: HTMLElement, aspect: number) {
    this.camera = new THREE.PerspectiveCamera(55, aspect, 0.1, 200);
    this.camera.position.set(3, 2.5, 5);

    this.controls = new OrbitControls(this.camera, domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 2;
    this.controls.maxDistance = 30;
    // Keep the camera above the ground plane.
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.target.set(0, 1, 0);
    this.controls.update();
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Recenter the orbit target, e.g. on the loaded character. */
  lookAtTarget(target: THREE.Vector3): void {
    this.controls.target.copy(target);
    this.controls.update();
  }

  update(): void {
    this.controls.update();
  }

  dispose(): void {
    this.controls.dispose();
  }
}
