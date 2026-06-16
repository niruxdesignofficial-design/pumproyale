import * as THREE from "three";

/**
 * Thin wrapper around THREE.WebGLRenderer with sensible defaults for a stylized
 * party game: sRGB output, filmic tone mapping, soft shadows, and a capped
 * device pixel ratio so high-DPI displays stay performant.
 */
export class Renderer {
  readonly instance: THREE.WebGLRenderer;

  constructor(canvas: HTMLCanvasElement) {
    this.instance = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.instance.outputColorSpace = THREE.SRGBColorSpace;
    this.instance.toneMapping = THREE.ACESFilmicToneMapping;
    this.instance.toneMappingExposure = 1.0;
    this.instance.shadowMap.enabled = true;
    this.instance.shadowMap.type = THREE.PCFSoftShadowMap;
    this.instance.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  }

  setSize(width: number, height: number): void {
    this.instance.setSize(width, height, false);
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    this.instance.render(scene, camera);
  }

  dispose(): void {
    this.instance.dispose();
  }
}
