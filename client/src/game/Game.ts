import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { Renderer } from "../core/Renderer";
import { CameraRig } from "../core/CameraRig";
import { GameLoop } from "../core/GameLoop";
import { Input } from "../core/Input";
import { PhysicsWorld } from "../physics/PhysicsWorld";
import { createScene, PLATFORM_HALF, PLATFORM_THICKNESS } from "./Scene";
import { Character } from "./Character";
import { CharacterController } from "./CharacterController";
import { Bumper } from "./obstacles/Bumper";
import { gameStore } from "./store";

const UP = new THREE.Vector3(0, 1, 0);
const SPAWN = new THREE.Vector3(0, 2, 0);

/**
 * Phase 2 game orchestrator: a single-player physics sandbox. Owns the renderer,
 * scene, follow camera, Rapier world, the capsule character controller, and a
 * greybox bumper. The render loop samples input, steps physics at a fixed rate,
 * then syncs visuals.
 */
export class Game {
  private readonly renderer: Renderer;
  private readonly scene: THREE.Scene;
  private readonly cameraRig: CameraRig;
  private readonly character = new Character();
  private readonly input = new Input();
  private readonly loop: GameLoop;

  private physics: PhysicsWorld | null = null;
  private controller: CharacterController | null = null;
  private readonly bumpers: Bumper[] = [];

  private disposed = false;
  private fpsPublishAccum = 0;

  // Scratch vectors reused each frame.
  private readonly forward = new THREE.Vector3();
  private readonly right = new THREE.Vector3();

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

    this.physics = await PhysicsWorld.create();
    if (this.disposed) return;

    // Static platform collider, aligned with the visual platform (top at y=0).
    this.physics.world.createCollider(
      RAPIER.ColliderDesc.cuboid(
        PLATFORM_HALF,
        PLATFORM_THICKNESS / 2,
        PLATFORM_HALF,
      ).setTranslation(0, -PLATFORM_THICKNESS / 2, 0),
    );

    this.controller = new CharacterController(this.physics, this.character, SPAWN);

    const bumper = new Bumper(this.physics, new THREE.Vector3(3.5, 0, 0), 1);
    this.scene.add(bumper.mesh);
    this.bumpers.push(bumper);

    this.input.attach();
    this.cameraRig.snapTo(this.controller.position);

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
    this.input.detach();
    this.cameraRig.dispose();
    this.character.dispose();
    this.physics?.dispose();
    this.renderer.dispose();
    gameStore.reset();
  }

  private readonly onFrame = (dt: number): void => {
    if (this.controller && this.physics) {
      this.controller.setInput(this.sampleInput());
      this.physics.step(dt, () => this.controller?.fixedUpdate());
      this.controller.update(dt);
      for (const bumper of this.bumpers) bumper.update(dt, this.controller);
      this.cameraRig.follow(this.controller.position);
    }

    this.cameraRig.update();
    this.renderer.render(this.scene, this.cameraRig.camera);

    this.fpsPublishAccum += dt;
    if (this.fpsPublishAccum >= 0.25) {
      this.fpsPublishAccum = 0;
      gameStore.set({ fps: this.loop.getFps() });
    }
  };

  /** Build a camera-relative move direction from the current key state. */
  private sampleInput() {
    const f = (this.input.isActive("forward") ? 1 : 0) - (this.input.isActive("back") ? 1 : 0);
    const r = (this.input.isActive("right") ? 1 : 0) - (this.input.isActive("left") ? 1 : 0);

    this.cameraRig.getForward(this.forward);
    this.right.crossVectors(this.forward, UP).normalize();

    const moveX = this.forward.x * f + this.right.x * r;
    const moveZ = this.forward.z * f + this.right.z * r;

    return {
      moveX,
      moveZ,
      run: this.input.isActive("run"),
      jump: this.input.isActive("jump"),
      dive: this.input.isActive("dive"),
    };
  }

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
