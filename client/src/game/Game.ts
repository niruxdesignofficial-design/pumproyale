import type * as THREE from "three";
import { Renderer } from "../core/Renderer";
import { CameraRig } from "../core/CameraRig";
import { GameLoop } from "../core/GameLoop";
import { createScene } from "./Scene";
import { Character } from "./Character";
import { gameStore } from "./store";

/**
 * Phase 1 game orchestrator. Owns the renderer, scene, camera rig, character,
 * and the frame loop. Boots imperatively against a canvas supplied by React;
 * the React overlay only observes state through the gameStore.
 */
export class Game {
  private readonly renderer: Renderer;
  private readonly scene: THREE.Scene;
  private readonly cameraRig: CameraRig;
  private readonly character = new Character();
  private readonly loop: GameLoop;

  private disposed = false;
  private fpsPublishAccum = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas);
    this.scene = createScene();
    this.cameraRig = new CameraRig(canvas, this.aspect());
    this.renderer.setSize(this.width(), this.height());
    this.loop = new GameLoop(this.onFrame);
    window.addEventListener("resize", this.onResize);
  }

  async start(): Promise<void> {
    const result = await this.character.load();
    if (this.disposed) return;

    this.scene.add(this.character.object3d);
    this.cameraRig.lookAtTarget(this.character.getFocusPoint());

    gameStore.set({
      phase: "ready",
      usingFallback: result.usingFallback,
      characterLabel: result.label,
    });

    this.loop.start();
  }

  dispose(): void {
    this.disposed = true;
    this.loop.stop();
    window.removeEventListener("resize", this.onResize);
    this.cameraRig.dispose();
    this.character.dispose();
    this.renderer.dispose();
    gameStore.reset();
  }

  private readonly onFrame = (dt: number): void => {
    this.character.update(dt);
    this.cameraRig.update();
    this.renderer.render(this.scene, this.cameraRig.camera);

    // Publish FPS to the HUD a few times per second, not every frame.
    this.fpsPublishAccum += dt;
    if (this.fpsPublishAccum >= 0.25) {
      this.fpsPublishAccum = 0;
      gameStore.set({ fps: this.loop.getFps() });
    }
  };

  private readonly onResize = (): void => {
    this.renderer.setSize(this.width(), this.height());
    this.cameraRig.setAspect(this.aspect());
  };

  private width(): number {
    return this.canvas.clientWidth || window.innerWidth;
  }

  private height(): number {
    return this.canvas.clientHeight || window.innerHeight;
  }

  private aspect(): number {
    return this.width() / this.height();
  }
}
