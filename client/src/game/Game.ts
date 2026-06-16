import * as THREE from "three";
import { getStateCallbacks, type Room } from "colyseus.js";
import { MAX_PLAYERS, type AnimationState, type InputIntent } from "@party-royale/shared";
import { Renderer } from "../core/Renderer";
import { CameraRig } from "../core/CameraRig";
import { GameLoop } from "../core/GameLoop";
import { Input } from "../core/Input";
import { NetClient, defaultServerUrl } from "../net/NetClient";
import { createScene } from "./Scene";
import { Avatar } from "./Avatar";
import { loadCharacterGltf } from "./characterModel";
import { gameStore } from "./store";

const UP = new THREE.Vector3(0, 1, 0);
const SEND_INTERVAL = 1 / 30;

/** Minimal shape of a synced player, for reading authoritative state. */
interface NetPlayer {
  name: string;
  wallet: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  anim: string;
  alive: boolean;
  isBot: boolean;
  placement: number;
}

/**
 * Networked game client. Connects to the authoritative Colyseus match room,
 * renders an Avatar per player interpolated toward server transforms, samples
 * local input and sends it as intents, and follows the local player with the
 * camera. It holds no authoritative state of its own.
 */
export class Game {
  private readonly renderer: Renderer;
  private readonly scene: THREE.Scene;
  private readonly cameraRig: CameraRig;
  private readonly input = new Input();
  private readonly loop: GameLoop;
  private readonly net = new NetClient();

  private readonly avatars = new Map<string, Avatar>();
  private gltf: Awaited<ReturnType<typeof loadCharacterGltf>> = null;
  private localId: string | null = null;
  private cameraSnapped = false;

  private disposed = false;
  private seq = 0;
  private sendAccum = 0;
  private fpsAccum = 0;

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
    this.gltf = await loadCharacterGltf();
    if (this.disposed) return;

    let room: Room;
    try {
      room = await this.net.connect(defaultServerUrl(), { name: randomName() });
    } catch (err) {
      console.error("[net] connection failed", err);
      gameStore.set({ status: "error", error: "Could not reach the game server." });
      return;
    }
    if (this.disposed) {
      void this.net.dispose();
      return;
    }

    this.localId = room.sessionId;
    this.wireRoom(room);

    this.input.attach();
    gameStore.set({
      status: "connected",
      usingFallback: this.gltf === null,
      matchPhase: readString(room.state, "phase"),
    });
    this.loop.start();
  }

  dispose(): void {
    this.disposed = true;
    this.loop.stop();
    window.removeEventListener("resize", this.onResize);
    this.input.detach();
    void this.net.dispose();
    for (const avatar of this.avatars.values()) avatar.dispose();
    this.avatars.clear();
    this.cameraRig.dispose();
    this.renderer.dispose();
    gameStore.reset();
  }

  private wireRoom(room: Room): void {
    const $ = getStateCallbacks(room);

    $(room.state).players?.onAdd((player: NetPlayer, sessionId: string) => {
      const avatar = new Avatar(this.gltf, colorForId(sessionId));
      avatar.setTarget(player.x, player.y, player.z, player.yaw);
      avatar.setAnim(asAnim(player.anim));
      this.scene.add(avatar.object3d);
      this.avatars.set(sessionId, avatar);
      this.publishPlayerCount();

      if (sessionId === this.localId && !this.cameraSnapped) {
        this.cameraRig.snapTo(avatar.position);
        this.cameraSnapped = true;
      }

      $(player).onChange(() => {
        avatar.setTarget(player.x, player.y, player.z, player.yaw);
        avatar.setAnim(asAnim(player.anim));
      });
    });

    $(room.state).players?.onRemove((_player: NetPlayer, sessionId: string) => {
      const avatar = this.avatars.get(sessionId);
      if (avatar) {
        this.scene.remove(avatar.object3d);
        avatar.dispose();
        this.avatars.delete(sessionId);
      }
      this.publishPlayerCount();
    });

    $(room.state).listen?.("phase", (value: string) => gameStore.set({ matchPhase: value }));

    room.onLeave(() => {
      if (!this.disposed) gameStore.set({ status: "error", error: "Disconnected from server." });
    });
  }

  private readonly onFrame = (dt: number): void => {
    // Send input to the server at a fixed rate.
    this.sendAccum += dt;
    if (this.sendAccum >= SEND_INTERVAL && this.net.room) {
      this.sendAccum = 0;
      this.net.sendInput(this.sampleInput());
    }

    for (const avatar of this.avatars.values()) avatar.update(dt);

    const local = this.localId ? this.avatars.get(this.localId) : undefined;
    if (local) this.cameraRig.follow(local.position);
    this.cameraRig.update();
    this.renderer.render(this.scene, this.cameraRig.camera);

    this.fpsAccum += dt;
    if (this.fpsAccum >= 0.25) {
      this.fpsAccum = 0;
      gameStore.set({ fps: this.loop.getFps() });
    }
  };

  private sampleInput(): InputIntent {
    const f = (this.input.isActive("forward") ? 1 : 0) - (this.input.isActive("back") ? 1 : 0);
    const r = (this.input.isActive("right") ? 1 : 0) - (this.input.isActive("left") ? 1 : 0);

    this.cameraRig.getForward(this.forward);
    this.right.crossVectors(this.forward, UP).normalize();

    return {
      moveX: this.forward.x * f + this.right.x * r,
      moveZ: this.forward.z * f + this.right.z * r,
      run: this.input.isActive("run"),
      jump: this.input.isActive("jump"),
      dive: this.input.isActive("dive"),
      seq: this.seq++,
    };
  }

  private publishPlayerCount(): void {
    gameStore.set({ playerCount: Math.min(this.avatars.size, MAX_PLAYERS) });
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

const ANIM_STATES = new Set(["idle", "run", "jump", "fall", "dive", "hit", "win", "lose"]);
function asAnim(value: string): AnimationState {
  return (ANIM_STATES.has(value) ? value : "idle") as AnimationState;
}

function readString(state: unknown, key: string): string {
  const v = (state as Record<string, unknown>)?.[key];
  return typeof v === "string" ? v : "";
}

function colorForId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  const hue = (hash % 360) / 360;
  return new THREE.Color().setHSL(hue, 0.65, 0.55).getHex();
}

function randomName(): string {
  const animals = ["Fox", "Bear", "Duck", "Wolf", "Cat", "Owl", "Frog", "Hare"];
  const animal = animals[Math.floor(Math.random() * animals.length)];
  return `${animal}-${Math.floor(Math.random() * 100)}`;
}
