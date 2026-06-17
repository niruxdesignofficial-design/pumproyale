import * as THREE from "three";

const DIST = 8.5;
const HEIGHT = 4.2;
const BASE_PITCH = 0.34; // downward tilt (radians)
const YAW_EASE = 0.1;
const TARGET_EASE = 0.2;

/**
 * Auto-positioning third-person camera. It eases an orbit angle to sit BEHIND the
 * player's facing (`setYaw`) at a fixed distance/height and looks at them, so the
 * objective is always ahead and the player's back is to camera — no manual orbit
 * needed. A light drag-to-look and wheel-zoom are supported and decay back to the
 * automatic framing. Movement input stays camera-relative via `getForward()`.
 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;

  private readonly target = new THREE.Vector3(0, 1, 0);
  private readonly tmp = new THREE.Vector3();
  private readonly camDir = new THREE.Vector3();
  private readonly ray = new THREE.Raycaster();
  private occluder: THREE.Object3D | null = null;
  private currentYaw = 0;
  private desiredYaw = 0;
  private dist = DIST;
  private userYaw = 0;
  private userPitch = 0;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;

  constructor(
    private readonly dom: HTMLElement,
    aspect: number,
  ) {
    this.camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 600);
    this.camera.position.set(0, HEIGHT, DIST);
    dom.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    dom.addEventListener("wheel", this.onWheel, { passive: true });
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Desired camera azimuth = the player's facing yaw (camera sits behind it). */
  setYaw(yaw: number): void {
    this.desiredYaw = yaw;
  }

  /** The object tree the camera should not see through (the active map). */
  setOccluder(o: THREE.Object3D): void {
    this.occluder = o;
  }

  /** Snap immediately to a target (on spawn) with no easing. */
  snapTo(target: THREE.Vector3): void {
    this.target.set(target.x, target.y + 1, target.z);
    this.currentYaw = this.desiredYaw;
    this.userYaw = 0;
    this.userPitch = 0;
    this.place();
  }

  /** Smoothly follow the player, easing the orbit behind their facing. */
  follow(target: THREE.Vector3): void {
    this.target.lerp(this.tmp.set(target.x, target.y + 1, target.z), TARGET_EASE);
    this.currentYaw = lerpAngle(this.currentYaw, this.desiredYaw, YAW_EASE);
    if (!this.dragging) {
      this.userYaw *= 0.9;
      this.userPitch *= 0.9;
    }
    this.place();
  }

  /** Spectator framing (rarely used): sit south-ish and look at the target. */
  spectate(target: THREE.Vector3): void {
    this.target.lerp(this.tmp.set(target.x, target.y + 1, target.z), 0.1);
    this.currentYaw = lerpAngle(this.currentYaw, Math.PI, 0.05);
    this.place();
  }

  private place(): void {
    const yaw = this.currentYaw + this.userYaw;
    const pitch = clamp(BASE_PITCH + this.userPitch, 0.05, 1.2);
    const horiz = Math.cos(pitch) * this.dist;
    // Player faces +z at yaw=0 (model faces +Z); the camera sits on the -forward side.
    this.camera.position.set(
      this.target.x - Math.sin(yaw) * horiz,
      this.target.y + HEIGHT + Math.sin(pitch) * this.dist,
      this.target.z - Math.cos(yaw) * horiz,
    );

    // Occlusion: if a map prop is between the player and the camera, pull in so the
    // view is never blocked (e.g. trees behind the climb start).
    if (this.occluder) {
      this.camDir.copy(this.camera.position).sub(this.target);
      const dist = this.camDir.length();
      if (dist > 0.01) {
        this.camDir.multiplyScalar(1 / dist);
        this.ray.set(this.target, this.camDir);
        this.ray.far = dist;
        const hits = this.ray.intersectObject(this.occluder, true);
        if (hits.length > 0 && hits[0]!.distance < dist) {
          const d = Math.max(2, hits[0]!.distance - 0.4);
          this.camera.position
            .copy(this.target)
            .addScaledVector(this.camDir, d);
        }
      }
    }

    this.camera.lookAt(this.target);
  }

  /** Camera-relative forward direction projected on the ground plane. */
  getForward(out: THREE.Vector3): THREE.Vector3 {
    this.camera.getWorldDirection(out);
    out.y = 0;
    return out.normalize();
  }

  update(): void {
    /* no-op: kept for API compatibility (no OrbitControls to step) */
  }

  dispose(): void {
    this.dom.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    this.dom.removeEventListener("wheel", this.onWheel);
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    this.dragging = true;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    if (!this.dragging) return;
    this.userYaw -= (e.clientX - this.lastX) * 0.006;
    this.userPitch += (e.clientY - this.lastY) * 0.005;
    this.userPitch = clamp(this.userPitch, -0.3, 0.6);
    this.lastX = e.clientX;
    this.lastY = e.clientY;
  };

  private readonly onPointerUp = (): void => {
    this.dragging = false;
  };

  private readonly onWheel = (e: WheelEvent): void => {
    this.dist = clamp(this.dist + e.deltaY * 0.01, 5, 14);
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function lerpAngle(a: number, b: number, t: number): number {
  let diff = (b - a) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}
