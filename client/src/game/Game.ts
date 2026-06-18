import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { MAX_PLAYERS, teamColor, type AnimationState, type InputIntent } from "@party-royale/shared";
import type { MatchState, PlayerState } from "@engine/rooms/schema";
import { Renderer } from "../core/Renderer";
import { CameraRig } from "../core/CameraRig";
import { GameLoop } from "../core/GameLoop";
import { Input } from "../core/Input";
import { sound } from "../core/Sound";
import { getAuthWallet } from "../solana/auth";
import { createScene } from "./Scene";
import { MinigameViews } from "./MinigameViews";
import { Avatar } from "./Avatar";
import { getCharacterGltf, preloadCharacters } from "./characterModel";
import { preloadVarietyProps } from "./VarietyProps";
import { getSelectedCharacter } from "./selection";
import { getPlayerName } from "./name";
import { LocalGameManager } from "./LocalGameManager";
import { gameStore, type Standing } from "./store";

const UP = new THREE.Vector3(0, 1, 0);
const CENTER = new THREE.Vector3(0, 1, 0);

/** Minimal shape of a synced dynamic entity (for the minigame view layer). */
interface NetEntity {
  kind: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  active: boolean;
  variant: number;
}

/** Ground-ring color for a player: team color in team rounds, else candy color. */
function ringColorFor(team: number, colorIndex: number): number {
  if (team === 0) return 0x4aa3ff; // Blue
  if (team === 1) return 0xff5a5a; // Red
  return teamColor(colorIndex);
}

/**
 * Offline game client. Runs the full match simulation locally (LocalGameManager —
 * physics + the four minigames + bot AI in the browser, 1 human + 3 bots), renders
 * an Avatar per player, samples local input, and mirrors the live state into the
 * store each frame. No network: there is no server to lose connection to.
 */
export class Game {
  private readonly renderer: Renderer;
  private readonly scene: THREE.Scene;
  private readonly cameraRig: CameraRig;
  private readonly input = new Input();
  private readonly loop: GameLoop;
  private readonly minigameViews: MinigameViews;
  private local: LocalGameManager | null = null;
  private readonly localId = "local";

  private readonly avatars = new Map<string, Avatar>();
  private readonly tracers: { mesh: THREE.Mesh; ttl: number }[] = [];
  private readonly dust: { mesh: THREE.Mesh; ttl: number; max: number }[] = [];
  // Per-player change caches (replace Colyseus onChange) + global flow caches.
  private readonly cAnim = new Map<string, string>();
  private readonly cTeam = new Map<string, number>();
  private readonly cEmote = new Map<string, string>();
  private cameraSnapped = false;
  private standingsSig = "";
  private matchPhase = "";
  private currentMinigame = "";
  private localRoundScore = 0;
  private scorePopKey = 0;
  private prevTimer = -1;
  private prevRound = -1;
  private prevRoundCount = -1;
  private prevAlive = -1;
  private prevBanner = "";
  private prevWinnerId = "";
  private prevWinnerName = "";

  private disposed = false;
  private seq = 0;
  private fpsAccum = 0;

  private readonly forward = new THREE.Vector3();
  private readonly right = new THREE.Vector3();

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas);
    const built = createScene();
    this.scene = built.scene;
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

    const local = new LocalGameManager({
      name: getPlayerName() || randomName(),
      character: getSelectedCharacter(),
      wallet: getAuthWallet() ?? null,
    });
    try {
      await local.start();
    } catch (err) {
      console.error("[local] failed to start", err);
      gameStore.set({ status: "error", error: "Could not start the game engine." });
      return;
    }
    if (this.disposed) {
      local.dispose();
      return;
    }
    this.local = local;

    this.input.attach();
    window.addEventListener("keydown", this.enableSound, { once: true });
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
    this.local?.dispose();
    this.local = null;
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

  private readonly onFrame = (dt: number): void => {
    const local = this.local;
    if (local) {
      local.setLocalInput(this.sampleInput());
      local.step(dt);
      this.syncFromState(local.state);
    }

    for (const avatar of this.avatars.values()) avatar.update(dt);

    if (local) {
      const st = local.state;
      let view = "";
      if (st.phase === "waiting" || st.phase === "matchmaking") view = "lobby";
      else if ((st.phase === "playing" || st.phase === "intro") && st.minigame) view = st.minigame;
      this.minigameViews.setMinigame(view);
      this.minigameViews.update(
        dt,
        st.roundClock,
        st.entities as unknown as ArrayLike<NetEntity>,
        st.tiles as unknown as ArrayLike<number>,
      );
      this.publishStandings(st);
    }

    this.updateTracers(dt);
    this.updateDust(dt);

    const localAvatar = this.avatars.get(this.localId);
    if (localAvatar) {
      this.cameraRig.follow(localAvatar.position);
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

  /** Diff the local match state each frame to drive avatars, juice, and the store. */
  private syncFromState(state: MatchState): void {
    const seen = new Set<string>();
    state.players.forEach((p: PlayerState, id: string) => {
      seen.add(id);
      const isLocal = id === this.localId;
      let avatar = this.avatars.get(id);
      if (!avatar) {
        avatar = new Avatar(p.character, teamColor(p.colorIndex), isLocal ? `${p.name} (you)` : p.name);
        if (isLocal) avatar.setLocal();
        avatar.setTarget(p.x, p.y, p.z, p.yaw);
        this.scene.add(avatar.object3d);
        this.avatars.set(id, avatar);
        this.cAnim.set(id, p.anim);
        this.cTeam.set(id, NaN);
        this.cEmote.set(id, "");
        gameStore.set({ playerCount: Math.min(this.avatars.size, MAX_PLAYERS) });
        if (isLocal && !this.cameraSnapped) {
          this.cameraRig.snapTo(avatar.position);
          this.cameraSnapped = true;
        }
      }
      avatar.setTarget(p.x, p.y, p.z, p.yaw);

      const anim = asAnim(p.anim);
      const lastAnim = this.cAnim.get(id) ?? "idle";
      if (anim === "shoot" && lastAnim !== "shoot") {
        const yaw = isLocal ? Math.atan2(this.forward.x, this.forward.z) : p.yaw;
        this.spawnTracer(avatar.position, yaw);
        if (isLocal) sound.play("shoot");
      }
      const wasAir = lastAnim === "jump" || lastAnim === "fall" || lastAnim === "dive";
      if (wasAir && (anim === "idle" || anim === "run")) this.spawnDust(avatar.position);
      if (anim === "hit" && lastAnim !== "hit" && isLocal) this.cameraRig.addShake(0.28);
      this.cAnim.set(id, p.anim);
      avatar.setAnim(anim);

      if (p.emote !== this.cEmote.get(id)) {
        this.cEmote.set(id, p.emote);
        avatar.setEmote(p.emote);
      }
      if (p.team !== this.cTeam.get(id)) {
        this.cTeam.set(id, p.team);
        avatar.setRingColor(ringColorFor(p.team, p.colorIndex));
      }

      if (isLocal) {
        const delta = p.roundScore - this.localRoundScore;
        if (delta > 0 && /gem/i.test(this.currentMinigame)) sound.play("pickup");
        if (delta !== 0 && this.matchPhase === "playing") {
          this.scorePopKey += 1;
          gameStore.set({ scorePop: { amount: delta, key: this.scorePopKey } });
        }
        this.localRoundScore = p.roundScore;
        gameStore.set({ localPlacement: p.placement, localCombo: p.combo });
      }
    });

    for (const id of [...this.avatars.keys()]) {
      if (seen.has(id)) continue;
      const a = this.avatars.get(id)!;
      this.scene.remove(a.object3d);
      a.dispose();
      this.avatars.delete(id);
      this.cAnim.delete(id);
      this.cTeam.delete(id);
      this.cEmote.delete(id);
      gameStore.set({ playerCount: Math.min(this.avatars.size, MAX_PLAYERS) });
    }

    this.syncGlobals(state);
  }

  /** Mirror top-level match flow into the store, firing sounds/shake on change. */
  private syncGlobals(state: MatchState): void {
    if (state.phase !== this.matchPhase) {
      if (state.phase === "playing") sound.play("go");
      this.matchPhase = state.phase;
      gameStore.set({ matchPhase: state.phase });
    }
    if (state.minigame !== this.currentMinigame) {
      this.currentMinigame = state.minigame;
      gameStore.set({ minigame: state.minigame });
    }
    if (state.round !== this.prevRound) {
      this.prevRound = state.round;
      gameStore.set({ round: state.round });
    }
    if (state.roundCount !== this.prevRoundCount) {
      this.prevRoundCount = state.roundCount;
      gameStore.set({ roundCount: state.roundCount });
    }
    if (state.timer !== this.prevTimer) {
      if (this.matchPhase === "countdown" && state.timer > 0) sound.play("tick");
      this.prevTimer = state.timer;
      gameStore.set({ timer: state.timer });
    }
    if (state.alive !== this.prevAlive) {
      this.prevAlive = state.alive;
      gameStore.set({ alivePlayers: state.alive });
    }
    if (state.banner !== this.prevBanner) {
      if (state.banner && /goal/i.test(state.banner)) {
        sound.play("goal");
        this.cameraRig.addShake(0.22);
      }
      this.prevBanner = state.banner;
      gameStore.set({ banner: state.banner });
    }
    if (state.winnerName !== this.prevWinnerName) {
      this.prevWinnerName = state.winnerName;
      gameStore.set({ winnerName: state.winnerName });
    }
    if (state.winnerId !== this.prevWinnerId) {
      this.prevWinnerId = state.winnerId;
      const isLocal = state.winnerId.length > 0 && state.winnerId === this.localId;
      gameStore.set({ isLocalWinner: isLocal });
      if (state.winnerId.length > 0) {
        sound.play(isLocal ? "win" : "lose");
        if (isLocal) this.cameraRig.addShake(0.5);
      }
    }
  }

  /** Build the live scoreboard from the local state; only push when it changes. */
  private publishStandings(state: MatchState): void {
    const list: Standing[] = [];
    state.players.forEach((p: PlayerState, id: string) => {
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
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    const map: Record<string, number> = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3 };
    const id = map[e.code];
    if (id === undefined) return;
    this.local?.sendEmote(id);
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
