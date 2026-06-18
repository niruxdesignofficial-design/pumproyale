import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { getStateCallbacks, type Room } from "colyseus.js";
import { MAX_PLAYERS, teamColor, type AnimationState, type InputIntent } from "@party-royale/shared";
import { Renderer } from "../core/Renderer";
import { CameraRig } from "../core/CameraRig";
import { GameLoop } from "../core/GameLoop";
import { Input } from "../core/Input";
import { sound } from "../core/Sound";
import { NetClient, defaultServerUrl } from "../net/NetClient";
import { getAuthWallet } from "../solana/auth";
import { createScene } from "./Scene";
import { MinigameViews } from "./MinigameViews";
import { Avatar } from "./Avatar";
import { getCharacterGltf, preloadCharacters } from "./characterModel";
import { preloadVarietyProps } from "./VarietyProps";
import { getSelectedCharacter } from "./selection";
import { getPlayMode } from "./matchMode";
import { getPlayerName } from "./name";
import { gameStore, type Standing } from "./store";

const UP = new THREE.Vector3(0, 1, 0);
const CENTER = new THREE.Vector3(0, 1, 0);
const SEND_INTERVAL = 1 / 30;

/** Minimal shape of a synced dynamic entity. */
interface NetEntity {
  kind: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  active: boolean;
  variant: number;
}

/** Minimal shape of synced match state read directly each frame for rendering. */
interface MatchStateView {
  phase: string;
  minigame: string;
  roundClock: number;
  entities: ArrayLike<NetEntity>;
  tiles: ArrayLike<boolean>;
}

/** Minimal shape of a synced player, for reading authoritative state. */
interface NetPlayer {
  name: string;
  wallet: string;
  character: string;
  colorIndex: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  anim: string;
  alive: boolean;
  isBot: boolean;
  placement: number;
  points: number;
  roundScore: number;
  team: number;
  emote: string;
  combo: number;
}

/** Ground-ring color for a player: team color in team rounds, else candy color. */
function ringColorFor(team: number, colorIndex: number): number {
  if (team === 0) return 0x4aa3ff; // Blue
  if (team === 1) return 0xff5a5a; // Red
  return teamColor(colorIndex);
}

/**
 * Networked game client. Connects to the authoritative Colyseus match room,
 * renders an Avatar per player interpolated toward server transforms, samples
 * local input and sends it as intents, mirrors match flow + the live scoreboard
 * into the store, and follows the local player.
 */
export class Game {
  private readonly renderer: Renderer;
  private readonly scene: THREE.Scene;
  private readonly cameraRig: CameraRig;
  private readonly input = new Input();
  private readonly loop: GameLoop;
  private readonly net = new NetClient();
  private readonly minigameViews: MinigameViews;

  private readonly avatars = new Map<string, Avatar>();
  private readonly tracers: { mesh: THREE.Mesh; ttl: number }[] = [];
  private readonly dust: { mesh: THREE.Mesh; ttl: number; max: number }[] = [];
  private localId: string | null = null;
  private cameraSnapped = false;
  private standingsSig = "";
  private matchPhase = "";
  private currentMinigame = "";
  private localRoundScore = 0;

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
    // Soft, even environment lighting (the KayKit clay sheen + clean GI feel).
    const pmrem = new THREE.PMREMGenerator(this.renderer.instance);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.minigameViews = new MinigameViews(built.scene, built.platform, built.grid);
    this.cameraRig = new CameraRig(canvas, this.aspect());
    this.renderer.setSize(this.width(), this.height());
    this.loop = new GameLoop(this.onFrame);
    window.addEventListener("resize", this.onResize);
  }

  async start(): Promise<void> {
    await Promise.all([preloadCharacters(), preloadVarietyProps()]);
    if (this.disposed) return;

    let room: Room;
    try {
      const wallet = getAuthWallet() ?? undefined;
      room = await this.net.connect(
        defaultServerUrl(),
        {
          name: getPlayerName() || randomName(),
          wallet,
          character: getSelectedCharacter(),
        },
        getPlayMode(),
      );
    } catch (err) {
      console.error("[net] connection failed", err);
      const joining = getPlayMode().kind === "join";
      gameStore.set({
        status: "error",
        error: joining
          ? "Could not find that game. Check the code and try again."
          : "Could not reach the game server.",
      });
      return;
    }
    if (this.disposed) {
      void this.net.dispose();
      return;
    }

    this.localId = room.sessionId;
    // Surface the room code for private games so the host can share it.
    if (getPlayMode().kind === "create") {
      gameStore.set({ roomCode: this.net.roomCode ?? "" });
    }
    this.wireRoom(room);

    this.input.attach();
    // Enable audio on the first user gesture (browsers block it before that).
    window.addEventListener("keydown", this.enableSound, { once: true });
    // Emotes: keys 1-4 send a quick text bubble above your avatar.
    window.addEventListener("keydown", this.onEmoteKey);
    gameStore.set({ status: "connected", usingFallback: getCharacterGltf("knight") === null });
    this.loop.start();
  }

  dispose(): void {
    this.disposed = true;
    this.loop.stop();
    window.removeEventListener("resize", this.onResize);
    this.input.detach();
    window.removeEventListener("keydown", this.enableSound);
    window.removeEventListener("keydown", this.onEmoteKey);
    void this.net.dispose();
    for (const t of this.tracers) {
      this.scene.remove(t.mesh);
      t.mesh.geometry.dispose();
      (t.mesh.material as THREE.Material).dispose();
    }
    this.tracers.length = 0;
    for (const d of this.dust) {
      this.scene.remove(d.mesh);
      d.mesh.geometry.dispose();
      (d.mesh.material as THREE.Material).dispose();
    }
    this.dust.length = 0;
    for (const avatar of this.avatars.values()) avatar.dispose();
    this.avatars.clear();
    this.cameraRig.dispose();
    this.renderer.dispose();
    gameStore.reset();
  }

  private wireRoom(room: Room): void {
    const $ = getStateCallbacks(room);

    $(room.state).players?.onAdd((player: NetPlayer, sessionId: string) => {
      const avatar = new Avatar(player.character, teamColor(player.colorIndex));
      avatar.setTarget(player.x, player.y, player.z, player.yaw);
      avatar.setAnim(asAnim(player.anim));
      this.scene.add(avatar.object3d);
      this.avatars.set(sessionId, avatar);
      gameStore.set({ playerCount: Math.min(this.avatars.size, MAX_PLAYERS) });

      if (sessionId === this.localId && !this.cameraSnapped) {
        this.cameraRig.snapTo(avatar.position);
        this.cameraSnapped = true;
      }

      let lastAnim = player.anim;
      let lastTeam = NaN;
      let lastEmote = "";
      $(player).onChange(() => {
        avatar.setTarget(player.x, player.y, player.z, player.yaw);
        const anim = asAnim(player.anim);
        // Cosmetic shot tracer when a player starts the shoot animation. The local
        // shooter fires along the camera aim (matching the crosshair).
        if (anim === "shoot" && lastAnim !== "shoot") {
          const yaw =
            sessionId === this.localId ? Math.atan2(this.forward.x, this.forward.z) : player.yaw;
          this.spawnTracer(avatar.position, yaw);
          if (sessionId === this.localId) sound.play("shoot");
        }
        // Dust puff when landing (an airborne anim resolves to grounded movement).
        const wasAir = lastAnim === "jump" || lastAnim === "fall" || lastAnim === "dive";
        if (wasAir && (anim === "idle" || anim === "run")) this.spawnDust(avatar.position);
        // Screen-shake when the local player takes a hit.
        if (anim === "hit" && lastAnim !== "hit" && sessionId === this.localId) {
          this.cameraRig.addShake(0.28);
        }
        if (player.emote !== lastEmote) {
          lastEmote = player.emote;
          avatar.setEmote(player.emote);
        }
        lastAnim = player.anim;
        avatar.setAnim(anim);
        if (player.team !== lastTeam) {
          lastTeam = player.team;
          avatar.setRingColor(ringColorFor(player.team, player.colorIndex));
        }
        if (sessionId === this.localId) {
          if (player.roundScore > this.localRoundScore && /gem/i.test(this.currentMinigame)) {
            sound.play("pickup");
          }
          this.localRoundScore = player.roundScore;
          gameStore.set({ localPlacement: player.placement, localCombo: player.combo });
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
    s.listen?.("phase", (v: string) => {
      this.matchPhase = v;
      gameStore.set({ matchPhase: v });
      if (v === "playing") sound.play("go");
    });
    s.listen?.("round", (v: number) => gameStore.set({ round: v }));
    s.listen?.("roundCount", (v: number) => gameStore.set({ roundCount: v }));
    s.listen?.("minigame", (v: string) => {
      this.currentMinigame = v;
      gameStore.set({ minigame: v });
    });
    s.listen?.("timer", (v: number) => {
      if (this.matchPhase === "countdown" && v > 0) sound.play("tick");
      gameStore.set({ timer: v });
    });
    s.listen?.("alive", (v: number) => gameStore.set({ alivePlayers: v }));
    s.listen?.("banner", (v: string) => {
      if (v && /goal/i.test(v)) {
        sound.play("goal");
        this.cameraRig.addShake(0.22);
      }
      gameStore.set({ banner: v });
    });
    s.listen?.("winnerName", (v: string) => gameStore.set({ winnerName: v }));
    s.listen?.("winnerId", (v: string) => {
      const isLocal = v.length > 0 && v === this.localId;
      gameStore.set({ isLocalWinner: isLocal });
      if (v.length > 0) {
        sound.play(isLocal ? "win" : "lose");
        if (isLocal) this.cameraRig.addShake(0.5);
      }
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

    const st = this.net.room?.state as unknown as MatchStateView | undefined;
    if (st) {
      // The lobby is a playable parkour while waiting; otherwise show the round map.
      let view = "";
      if (st.phase === "waiting") view = "lobby";
      else if ((st.phase === "playing" || st.phase === "intro") && typeof st.minigame === "string") {
        view = st.minigame;
      }
      this.minigameViews.setMinigame(view);
      this.minigameViews.update(
        dt,
        typeof st.roundClock === "number" ? st.roundClock : 0,
        st.entities,
        st.tiles,
      );
      this.publishStandings();
    }

    this.updateTracers(dt);
    this.updateDust(dt);

    const local = this.localId ? this.avatars.get(this.localId) : undefined;
    if (local) {
      this.cameraRig.follow(local.position);
      this.cameraRig.update();
    } else {
      this.cameraRig.spectate(CENTER);
    }
    this.renderer.render(this.scene, this.cameraRig.camera);

    this.fpsAccum += dt;
    if (this.fpsAccum >= 0.25) {
      this.fpsAccum = 0;
      gameStore.set({ fps: this.loop.getFps() });
    }
  };

  /** Build the live scoreboard from synced players; only push when it changes. */
  private publishStandings(): void {
    const room = this.net.room;
    if (!room) return;
    const players = room.state.players as unknown as {
      forEach(cb: (p: NetPlayer, id: string) => void): void;
    };
    const list: Standing[] = [];
    players.forEach((p, id) => {
      list.push({
        id,
        name: p.name,
        points: p.points,
        roundScore: p.roundScore,
        colorIndex: p.colorIndex,
        team: p.team,
        isLocal: id === this.localId,
        isBot: p.isBot,
      });
    });
    list.sort((a, b) => b.points - a.points || b.roundScore - a.roundScore);
    const sig = list.map((x) => `${x.id}:${x.points}:${x.roundScore}:${x.team}`).join("|");
    if (sig === this.standingsSig) return;
    this.standingsSig = sig;
    gameStore.set({ standings: list });
  }

  /** Spawn a short cosmetic shot tracer from a shooter along their facing yaw. */
  private spawnTracer(from: THREE.Vector3, yaw: number): void {
    const len = 9;
    const geo = new THREE.BoxGeometry(0.07, 0.07, len);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffe07a, transparent: true, opacity: 0.9 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(from.x + Math.sin(yaw) * (len / 2), from.y + 1.0, from.z + Math.cos(yaw) * (len / 2));
    mesh.rotation.y = yaw;
    this.scene.add(mesh);
    this.tracers.push({ mesh, ttl: 0.12 });
  }

  private updateTracers(dt: number): void {
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i]!;
      t.ttl -= dt;
      const mat = t.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, t.ttl / 0.12) * 0.9;
      if (t.ttl <= 0) {
        this.scene.remove(t.mesh);
        t.mesh.geometry.dispose();
        mat.dispose();
        this.tracers.splice(i, 1);
      }
    }
  }

  /** A quick expanding dust ring at an avatar's feet when it lands. */
  private spawnDust(at: THREE.Vector3): void {
    const geo = new THREE.RingGeometry(0.18, 0.34, 20);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xf3ead2,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(at.x, 0.06, at.z);
    this.scene.add(mesh);
    this.dust.push({ mesh, ttl: 0.4, max: 0.4 });
  }

  private updateDust(dt: number): void {
    for (let i = this.dust.length - 1; i >= 0; i--) {
      const d = this.dust[i]!;
      d.ttl -= dt;
      const k = Math.max(0, d.ttl / d.max);
      const s = 1 + (1 - k) * 2.4;
      d.mesh.scale.set(s, s, s);
      (d.mesh.material as THREE.MeshBasicMaterial).opacity = k * 0.55;
      if (d.ttl <= 0) {
        this.scene.remove(d.mesh);
        d.mesh.geometry.dispose();
        (d.mesh.material as THREE.Material).dispose();
        this.dust.splice(i, 1);
      }
    }
  }

  private readonly onEmoteKey = (e: KeyboardEvent): void => {
    // Ignore when typing in an input; only act on the digit row 1-4.
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    const map: Record<string, number> = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3 };
    const id = map[e.code];
    if (id === undefined) return;
    this.net.sendEmote(id);
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
      action: this.input.isActive("action"),
      // Aim = camera forward on the ground plane (precise shooting / kicking).
      aimX: this.forward.x,
      aimZ: this.forward.z,
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

const ANIM_STATES = new Set(["idle", "run", "jump", "fall", "dive", "hit", "win", "lose", "shoot"]);
function asAnim(value: string): AnimationState {
  return (ANIM_STATES.has(value) ? value : "idle") as AnimationState;
}

function randomName(): string {
  const animals = ["Fox", "Bear", "Duck", "Wolf", "Cat", "Owl", "Frog", "Hare"];
  const animal = animals[Math.floor(Math.random() * animals.length)];
  return `${animal}-${Math.floor(Math.random() * 100)}`;
}
