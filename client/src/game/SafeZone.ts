import * as THREE from "three";

/**
 * Visualizes the survival safe zone: a translucent disc with a bright rim that
 * scales to the authoritative radius streamed from the server. Hidden when the
 * radius is zero (no zone active).
 */
export class SafeZone {
  readonly object3d = new THREE.Group();

  constructor() {
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(1, 48),
      new THREE.MeshBasicMaterial({
        color: 0x4fd1c5,
        transparent: true,
        opacity: 0.12,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.02;

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.97, 1.0, 48),
      new THREE.MeshBasicMaterial({
        color: 0x7ef0e2,
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;

    this.object3d.add(disc, ring);
    this.object3d.visible = false;
  }

  setRadius(radius: number): void {
    if (radius <= 0.01) {
      this.object3d.visible = false;
      return;
    }
    this.object3d.visible = true;
    this.object3d.scale.set(radius, 1, radius);
  }
}
