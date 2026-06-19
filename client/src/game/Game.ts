import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { teamColor, type AnimationState, type InputIntent } from "@party-royale/shared";
import type { MatchState, PlayerState, EntityState } from "@engine/rooms/schema";
import { ARENA_HALF, BALL_R } from "@engine/pumpdash/PumpDashSim";
import { Renderer } from "../core/Renderer";
import { CameraRig } from "../core/CameraRig";
import { GameLoop } from "../core/GameLoop";
import { Input } from "../core/Input";
import { sound } from "../core/Sound";
import { createScene } from "./Scene";
import { buildArena, makeBall } from "./Arena";
import { Avatar } from "./Avatar";
import { getCharacterGltf, preloadCharacters } from "./characterModel";
import { getSelectedCharacter } from "./selection";
import { getPlayerName } from "./name";
import { getPlayerWallet } from "./wallet";
import { LocalSession, OnlineSession, type MatchSession } from "./session";
import { isOnlineEnabled } from "../net/NetClient";
import { gameStore, type PumpPlayer } from "./store";

const CENTER = new THREE.Vector3(0, 1.5, 0);

/** Ring color for a player by their candy color index. */
function ringColorFor(colorIndex: number): number {
  return teamColor(colorIndex);
}

/**
 * PumpDash game client. Reads an authoritative MatchState each frame (online room
 * or in-browser offline sim), renders the four paddle avatars (one per arena side)
 * and the ball, frames the local player's side at the bottom, and mirrors live
 * state into the store. The render path is identical online and offline.
 */
export class Game {
  private readonly renderer: Renderer;
  private readonly scene: THREE.Scene;
  private readonly cameraRig: CameraRig;
  private readonly input = new Input();
  private readonly loop: GameLoop;
  private readonly arena: THREE.Group;
  private session: MatchSession | null = null;
  private localId = "local";

  private readonly avatars = new Map<string, Avatar>();
  private readonly balls: THREE.Mesh[] = [];
  private readonly cAnim = new Map<string, string>();
  private readonly cEmote = new Map<string, string>();
  private readonly cPoints = new Map<string, number>();
  private readonly cAlive = new Map<string, boolean>();
  private readonly ballPrev: { x: number; z: number }[] = [];

  private cameraSide = -1;
  private readonly camDesired = new THREE.Vector3(0, 12, ARENA_HALF + 9);
  private matchPhase = "";
  private prevTimer = -1;
  private prevBanner = "";
  private prevWinnerId = "";
  private standingsSig = "";
  private disposed = false;
  private fpsAccum = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas);
    const built = createScene();
    this.scene = built.scene;
    // Hide the lobby platform/grid; PumpDash uses its own arena.
    built.platform.visible = false;
    built.grid.visible = false;
    const pmrem = new THREE.PMREMGenerator(this.renderer.instance);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.arena = buildArena();
    this.scene.add(this.arena);
    this.cameraRig = new CameraRig(canvas, this.aspect());
    this.cameraRig.controls.enabled = false; // fixed framing for PumpDash
    this.renderer.setSize(this.width(), this.height());
    this.loop = new GameLoop(this.onFrame);
    window.addEventListener("resize", this.onResize);
  }

  async start(): Promise<void> {
    await preloadCharacters();
    if (this.disposed) return;

    const options = {
      name: getPlayerName() || "Player",
      character: getSelectedCharacter(),
      wallet: getPlayerWallet() || undefined,
    };

    let session: MatchSession;
    try {
      if (isOnlineEnabled()) {
        gameStore.set({ status: "connecting" });
        try {
          session = await OnlineSession.create(options);
        } catch (err) {
          console.warn("[net] online connect failed, falling back to offline", err);
          session = await LocalSession.create(options);
        }
      } else {
        session = await LocalSession.create(options);
      }
    } catch (err) {
      console.error("[game] failed to start", err);
      gameStore.set({ status: "error", error: "Could not start the game engine." });
      return;
    }
    if (this.disposed) {
      session.dispose();
      return;
    }
    this.session = session;
    this.localId = session.localId;
    if (session.roomCode) gameStore.set({ roomCode: session.roomCode });

    this.input.attach();
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
    this.session?.dispose();
    this.session = null;
    for (const avatar of this.avatars.values()) avatar.dispose();
    this.avatars.clear();
    for (const b of this.balls) {
      this.scene.remove(b);
      b.geometry.dispose();
      (b.material as THREE.Material).dispose();
    }
    this.balls.length = 0;
    this.scene.remove(this.arena);
    this.cameraRig.dispose();
    this.renderer.dispose();
    gameStore.reset();
  }

  private readonly onFrame = (dt: number): void => {
    const session = this.session;
    if (session) {
      session.setInput(this.sampleInput());
      session.step(dt);
      this.syncFromState(session.state);
    }

    for (const avatar of this.avatars.values()) avatar.update(dt);

    this.updateCamera();
    this.renderer.render(this.scene, this.cameraRig.camera);

    this.fpsAccum += dt;
    if (this.fpsAccum >= 0.25) {
      this.fpsAccum = 0;
      gameStore.set({ fps: this.loop.getFps() });
    }
  };

  /** Diff the match state each frame to drive avatars, the ball, effects, store. */
  private syncFromState(state: MatchState): void {
    const seen = new Set<string>();
    let localSide = -1;
    state.players.forEach((p: PlayerState, id: string) => {
      seen.add(id);
      const isLocal = id === this.localId;
      if (isLocal) localSide = p.side;
      let avatar = this.avatars.get(id);
      if (!avatar) {
        avatar = new Avatar(p.character, ringColorFor(p.colorIndex), isLocal ? `${p.name} (you)` : p.name);
        if (isLocal) avatar.setLocal();
        avatar.setTarget(p.x, p.y, p.z, p.yaw);
        this.scene.add(avatar.object3d);
        this.avatars.set(id, avatar);
        this.cAnim.set(id, p.anim);
        this.cEmote.set(id, "");
        this.cPoints.set(id, p.points);
        this.cAlive.set(id, p.alive);
      }
      avatar.setTarget(p.x, p.y, p.z, p.yaw);
      avatar.setAnim(asAnim(p.anim));
      this.cAnim.set(id, p.anim);

      if (p.emote !== this.cEmote.get(id)) {
        this.cEmote.set(id, p.emote);
        avatar.setEmote(p.emote);
      }

      // Concede: a player's points dropped.
      const prevPts = this.cPoints.get(id) ?? p.points;
      if (p.points < prevPts && this.matchPhase === "playing") {
        if (isLocal) {
          sound.play("lose");
          this.cameraRig.addShake(0.3);
        } else {
          sound.play("goal");
        }
      }
      this.cPoints.set(id, p.points);

      // Eliminated.
      const prevAlive = this.cAlive.get(id) ?? true;
      if (prevAlive && !p.alive) sound.play("lose");
      this.cAlive.set(id, p.alive);
    });

    for (const id of [...this.avatars.keys()]) {
      if (seen.has(id)) continue;
      const a = this.avatars.get(id)!;
      this.scene.remove(a.object3d);
      a.dispose();
      this.avatars.delete(id);
      this.cAnim.delete(id);
      this.cEmote.delete(id);
      this.cPoints.delete(id);
      this.cAlive.delete(id);
    }

    if (localSide >= 0 && this.cameraSide !== localSide) this.setCameraSide(localSide);

    this.syncBalls(state.entities);
    this.publishStandings(state, localSide);
    this.syncGlobals(state);
  }

  private syncBalls(entities: ArrayLike<EntityState>): void {
    const list: EntityState[] = [];
    for (let i = 0; i < entities.length; i++) {
      const e = entities[i]!;
      if (e.kind === "ball" && e.active) list.push(e);
    }
    while (this.balls.length < list.length) {
      const mesh = makeBall(BALL_R);
      this.scene.add(mesh);
      this.balls.push(mesh);
      this.ballPrev.push({ x: 0, z: 0 });
    }
    while (this.balls.length > list.length) {
      const mesh = this.balls.pop()!;
      this.ballPrev.pop();
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    for (let i = 0; i < list.length; i++) {
      const e = list[i]!;
      const mesh = this.balls[i]!;
      const prev = this.ballPrev[i]!;
      // Soft click when the ball changes direction (wall/paddle bounce).
      if (this.matchPhase === "playing") {
        const flipX = Math.sign(e.x - mesh.position.x) !== Math.sign(mesh.position.x - prev.x);
        const flipZ = Math.sign(e.z - mesh.position.z) !== Math.sign(mesh.position.z - prev.z);
        const moved = Math.abs(e.x - mesh.position.x) + Math.abs(e.z - mesh.position.z) > 0.001;
        if (moved && (flipX || flipZ)) sound.play("shoot");
      }
      prev.x = mesh.position.x;
      prev.z = mesh.position.z;
      mesh.position.set(e.x, e.y, e.z);
      mesh.rotation.x += 0.2;
      mesh.rotation.y += 0.15;
    }
  }

  /** Mirror the player list + local info into the store (only when it changes). */
  private publishStandings(state: MatchState, localSide: number): void {
    const list: PumpPlayer[] = [];
    let dashCd = 0;
    state.players.forEach((p: PlayerState, id: string) => {
      const isLocal = id === this.localId;
      if (isLocal) dashCd = p.dashCd;
      list.push({
        id,
        name: p.name,
        side: p.side,
        points: p.points,
        alive: p.alive,
        isLocal,
        isBot: p.isBot,
        colorIndex: p.colorIndex,
        wallet: p.wallet,
      });
    });
    const sig =
      list.map((x) => `${x.id}:${x.side}:${x.points}:${x.alive ? 1 : 0}`).join("|") +
      `#${localSide}:${dashCd.toFixed(1)}`;
    if (sig === this.standingsSig) return;
    this.standingsSig = sig;
    gameStore.set({
      players: list,
      youSide: localSide,
      dashCd,
      dashReady: dashCd <= 0.01,
      alivePlayers: list.filter((p) => p.alive).length,
    });
  }

  /** Mirror top-level match flow into the store, firing sounds/shake on change. */
  private syncGlobals(state: MatchState): void {
    if (state.phase !== this.matchPhase) {
      if (state.phase === "playing") sound.play("go");
      this.matchPhase = state.phase;
      gameStore.set({ matchPhase: state.phase });
    }
    if (state.timer !== this.prevTimer) {
      if (this.matchPhase === "countdown" && state.timer > 0) sound.play("tick");
      this.prevTimer = state.timer;
      gameStore.set({ timer: state.timer });
    }
    if (state.banner !== this.prevBanner) {
      this.prevBanner = state.banner;
      gameStore.set({ banner: state.banner });
    }
    if (state.winnerId !== this.prevWinnerId) {
      this.prevWinnerId = state.winnerId;
      const isLocal = state.winnerId.length > 0 && state.winnerId === this.localId;
      const me = state.players.get(this.localId);
      gameStore.set({
        isLocalWinner: isLocal,
        winnerName: state.winnerName,
        localPlacement: me?.placement ?? 0,
      });
      if (state.winnerId.length > 0) {
        sound.play(isLocal ? "win" : "lose");
        if (isLocal) this.cameraRig.addShake(0.5);
      }
    }
  }

  // --- camera --------------------------------------------------------------

  private setCameraSide(side: number): void {
    this.cameraSide = side;
    const D = ARENA_HALF + 9;
    const H = 12;
    switch (side) {
      case 0:
        this.camDesired.set(0, H, -D);
        break;
      case 1:
        this.camDesired.set(0, H, D);
        break;
      case 2:
        this.camDesired.set(-D, H, 0);
        break;
      default:
        this.camDesired.set(D, H, 0);
        break;
    }
    // Snap on first assignment.
    this.cameraRig.camera.position.copy(this.camDesired);
    this.cameraRig.camera.lookAt(CENTER);
  }

  private updateCamera(): void {
    const cam = this.cameraRig.camera;
    cam.position.lerp(this.camDesired, 0.08);
    cam.lookAt(CENTER);
  }

  // --- input ---------------------------------------------------------------

  private sampleInput(): InputIntent {
    const slide = (this.input.isActive("right") ? 1 : 0) - (this.input.isActive("left") ? 1 : 0);
    const dash = this.input.isActive("jump") || this.input.isActive("action");
    return {
      moveX: slide,
      moveZ: 0,
      run: false,
      jump: dash,
      dive: false,
      action: dash,
      seq: 0,
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
