import * as THREE from "three";
import { getStateCallbacks, type Room } from "colyseus.js";
import { MAX_PLAYERS, type AnimationState, type InputIntent } from "@party-royale/shared";
import { Renderer } from "../core/Renderer";
import { CameraRig } from "../core/CameraRig";
import { GameLoop } from "../core/GameLoop";
import { Input } from "../core/Input";
import { sound } from "../core/Sound";
import { NetClient, defaultServerUrl } from "../net/NetClient";
import { getAuthWallet } from "../solana/auth";
import { createScene } from "./Scene";
import { SafeZone } from "./SafeZone";
import { MinigameViews } from "./MinigameViews";
import { Avatar } from "./Avatar";
import { getCharacterGltf, preloadCharacters } from "./characterModel";
import { getSelectedCharacter } from "./selection";
import { gameStore } from "./store";

const UP = new THREE.Vector3(0, 1, 0);
const CENTER = new THREE.Vector3(0, 1, 0);
const SEND_INTERVAL = 1 / 30;

/** Minimal shape of synced match state read directly each frame for rendering. */
interface MatchStateView {
  minigame: string;
  roundClock: number;
  tiles: ArrayLike<boolean>;
}

/** Minimal shape of a synced player, for reading authoritative state. */
interface NetPlayer {
  name: string;
  wallet: string;
  character: string;
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
 * local input and sends it as intents, mirrors match flow into the store, and
 * follows the local player (or the arena, while spectating).
 */
export class Game {
  private readonly renderer: Renderer;
  private readonly scene: THREE.Scene;
  private readonly cameraRig: CameraRig;
  private readonly input = new Input();
  private readonly loop: GameLoop;
  private readonly net = new NetClient();
  private readonly zone = new SafeZone();
  private readonly minigameViews: MinigameViews;

  private readonly avatars = new Map<string, Avatar>();
  private localId: string | null = null;
  private localAlive = true;
  private cameraSnapped = false;
  private zoneRadius = 0;

  private disposed = false;
  private seq = 0;
  private sendAccum = 0;
  private fpsAccum = 0;

  private readonly forward = new THREE.Vector3();
  private readonly right = new THREE.Vector3();

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas);
    const built = createScene();
    this.scene = built.scene;
    this.scene.add(this.zone.object3d);
    this.minigameViews = new MinigameViews(built.scene, built.platform, built.grid);
    this.cameraRig = new CameraRig(canvas, this.aspect());
    this.renderer.setSize(this.width(), this.height());
    this.loop = new GameLoop(this.onFrame);
    window.addEventListener("resize", this.onResize);
  }

  async start(): Promise<void> {
    await preloadCharacters();
    if (this.disposed) return;

    let room: Room;
    try {
      const wallet = getAuthWallet() ?? undefined;
      room = await this.net.connect(defaultServerUrl(), {
        name: randomName(),
        wallet,
        character: getSelectedCharacter(),
      });
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
    // Enable audio on the first user gesture (browsers block it before that).
    window.addEventListener("keydown", this.enableSound, { once: true });
    gameStore.set({ status: "connected", usingFallback: getCharacterGltf("knight") === null });
    this.loop.start();
  }

  dispose(): void {
    this.disposed = true;
    this.loop.stop();
    window.removeEventListener("resize", this.onResize);
    this.input.detach();
    window.removeEventListener("keydown", this.enableSound);
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
      const avatar = new Avatar(player.character, colorForId(sessionId));
      avatar.setTarget(player.x, player.y, player.z, player.yaw);
      avatar.setAnim(asAnim(player.anim));
      this.scene.add(avatar.object3d);
      this.avatars.set(sessionId, avatar);
      gameStore.set({ playerCount: Math.min(this.avatars.size, MAX_PLAYERS) });

      if (sessionId === this.localId && !this.cameraSnapped) {
        this.cameraRig.snapTo(avatar.position);
        this.cameraSnapped = true;
      }

      $(player).onChange(() => {
        avatar.setTarget(player.x, player.y, player.z, player.yaw);
        avatar.setAnim(asAnim(player.anim));
        avatar.setEliminated(!player.alive);
        if (sessionId === this.localId) {
          this.localAlive = player.alive;
          gameStore.set({ localAlive: player.alive, localPlacement: player.placement });
        }
      });
    });

    $(room.state).players?.onRemove((_player: NetPlayer, sessionId: string) => {
      const avatar = this.avatars.get(sessionId);
      if (avatar) {
        this.scene.remove(avatar.object3d);
        avatar.dispose();
        this.avatars.delete(sessionId);
      }
      gameStore.set({ playerCount: Math.min(this.avatars.size, MAX_PLAYERS) });
    });

    const s = $(room.state);
    s.listen?.("phase", (v: string) => gameStore.set({ matchPhase: v }));
    s.listen?.("round", (v: number) => gameStore.set({ round: v }));
    s.listen?.("minigame", (v: string) => gameStore.set({ minigame: v }));
    s.listen?.("timer", (v: number) => gameStore.set({ timer: v }));
    s.listen?.("alive", (v: number) => gameStore.set({ alivePlayers: v }));
    s.listen?.("zoneRadius", (v: number) => (this.zoneRadius = v));
    s.listen?.("winnerName", (v: string) => gameStore.set({ winnerName: v }));
    s.listen?.("winnerId", (v: string) => {
      const isLocal = v.length > 0 && v === this.localId;
      gameStore.set({ isLocalWinner: isLocal });
      if (v.length > 0) sound.play(isLocal ? "win" : "lose");
    });

    room.onLeave(() => {
      if (!this.disposed) gameStore.set({ status: "error", error: "Disconnected from server." });
    });
  }

  private readonly onFrame = (dt: number): void => {
    this.sendAccum += dt;
    if (this.sendAccum >= SEND_INTERVAL && this.net.room) {
      this.sendAccum = 0;
      this.net.sendInput(this.sampleInput());
    }

    for (const avatar of this.avatars.values()) avatar.update(dt);
    this.zone.setRadius(this.zoneRadius);

    const st = this.net.room?.state as unknown as MatchStateView | undefined;
    if (st) {
      this.minigameViews.setMinigame(typeof st.minigame === "string" ? st.minigame : "");
      this.minigameViews.update(typeof st.roundClock === "number" ? st.roundClock : 0, st.tiles);
    }

    const local = this.localId ? this.avatars.get(this.localId) : undefined;
    this.cameraRig.follow(local && this.localAlive ? local.position : CENTER);
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

  private readonly enableSound = (): void => sound.enable();

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
