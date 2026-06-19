import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { teamColor, type AnimationState, type InputIntent } from "@party-royale/shared";
import type { MatchState, PlayerState, EntityState } from "@engine/rooms/schema";
import { ARENA_HALF, BALL_R, DASH_CD } from "@engine/pumpdash/PumpDashSim";
import { Renderer } from "../core/Renderer";
import { CameraRig } from "../core/CameraRig";
import { GameLoop } from "../core/GameLoop";
import { Input } from "../core/Input";
import { sound } from "../core/Sound";
import { createScene } from "./Scene";
import { Arena, makeBall, makeObstacle, makeBlobShadow } from "./Arena";
import { preloadProps } from "./Props";
import { Avatar } from "./Avatar";
import { getCharacterGltf, preloadCharacters } from "./characterModel";
import { getSelectedCharacter } from "./selection";
import { getPlayerName } from "./name";
import { getPlayerWallet } from "./wallet";
import { LocalSession, OnlineSession, type MatchSession } from "./session";
import { isOnlineEnabled } from "../net/NetClient";
import { gameStore, type PumpPlayer } from "./store";

const CENTER = new THREE.Vector3(0, 1.5, 0);
const BALL_LERP_K = 18; // ball position smoothing rate

interface BallView {
  mesh: THREE.Mesh;
  shadow: THREE.Mesh;
  tx: number;
  ty: number;
  tz: number;
  px: number; // previous target (for velocity)
  pz: number;
  pvx: number; // previous velocity (for bounce detection)
  pvz: number;
  flash: number;
  squash: number;
  trailTimer: number;
}
interface Trail {
  mesh: THREE.Mesh;
  ttl: number;
}
interface Obst {
  group: THREE.Group;
  setSolid(solid: boolean): void;
}
interface Shock {
  mesh: THREE.Mesh;
  ttl: number;
  max: number;
}
interface Particle {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  ttl: number;
}

function ringColorFor(colorIndex: number): number {
  return teamColor(colorIndex);
}

/** Inward normal (x,z) for a side: direction from the edge toward the center. */
function inwardNormal(side: number): { x: number; z: number } {
  switch (side) {
    case 0:
      return { x: 0, z: 1 };
    case 1:
      return { x: 0, z: -1 };
    case 2:
      return { x: 1, z: 0 };
    default:
      return { x: -1, z: 0 };
  }
}

/**
 * PumpDash game client: reads an authoritative MatchState each frame (online room
 * or offline sim), renders the four paddle avatars, the ball (smoothed), and
 * mini-obstacles inside a forest diorama, with dash feedback (lunge, shockwave,
 * particles, ball flash, shake). Frames the local player's side at the bottom.
 */
export class Game {
  private readonly renderer: Renderer;
  private readonly scene: THREE.Scene;
  private readonly cameraRig: CameraRig;
  private readonly input = new Input();
  private readonly loop: GameLoop;
  private arena: Arena | null = null;
  private session: MatchSession | null = null;
  private localId = "local";

  private readonly avatars = new Map<string, Avatar>();
  private readonly balls: BallView[] = [];
  private readonly obstacles: Obst[] = [];
  private readonly shocks: Shock[] = [];
  private readonly particles: Particle[] = [];
  private readonly trails: Trail[] = [];
  private readonly cAnim = new Map<string, string>();
  private readonly cEmote = new Map<string, string>();
  private readonly cPoints = new Map<string, number>();
  private readonly cAlive = new Map<string, boolean>();

  private cameraSide = -1;
  private readonly camDesired = new THREE.Vector3(0, 12, ARENA_HALF + 9);
  private shake = 0;
  private dashCdClient = 0;
  private dashWindow = 0;
  private prevInputDash = false;
  private dashPulse = 0;
  private localSide = -1;
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
    built.platform.visible = false;
    built.grid.visible = false;
    const pmrem = new THREE.PMREMGenerator(this.renderer.instance);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.cameraRig = new CameraRig(canvas, this.aspect());
    this.cameraRig.controls.enabled = false;
    this.renderer.setSize(this.width(), this.height());
    this.loop = new GameLoop(this.onFrame);
    window.addEventListener("resize", this.onResize);
  }

  async start(): Promise<void> {
    await Promise.all([preloadCharacters(), preloadProps()]);
    if (this.disposed) return;
    this.arena = new Arena();
    this.scene.add(this.arena.group);

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
      this.disposeMesh(b.mesh);
      this.disposeMesh(b.shadow);
    }
    this.balls.length = 0;
    for (const o of this.obstacles) this.scene.remove(o.group);
    this.obstacles.length = 0;
    for (const s of this.shocks) this.disposeMesh(s.mesh);
    for (const p of this.particles) this.disposeMesh(p.mesh);
    for (const tr of this.trails) this.disposeMesh(tr.mesh);
    this.shocks.length = 0;
    this.particles.length = 0;
    this.trails.length = 0;
    if (this.arena) {
      this.scene.remove(this.arena.group);
      this.arena.dispose();
    }
    this.cameraRig.dispose();
    this.renderer.dispose();
    gameStore.reset();
  }

  private disposeMesh(m: THREE.Object3D): void {
    this.scene.remove(m);
    m.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.geometry?.dispose?.();
        const mat = mesh.material;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose?.();
      }
    });
  }

  private readonly onFrame = (dt: number): void => {
    const session = this.session;
    if (session) {
      session.setInput(this.sampleInput());
      session.step(dt);
      this.syncFromState(session.state);
    }

    for (const avatar of this.avatars.values()) avatar.update(dt);
    this.updateBalls(dt);
    this.updateEffects(dt);
    this.arena?.update(dt);
    this.updateCamera(dt);
    this.renderer.render(this.scene, this.cameraRig.camera);

    this.fpsAccum += dt;
    if (this.fpsAccum >= 0.25) {
      this.fpsAccum = 0;
      gameStore.set({ fps: this.loop.getFps() });
    }
  };

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

      const prevPts = this.cPoints.get(id) ?? p.points;
      if (p.points < prevPts && this.matchPhase === "playing") {
        this.arena?.flashSide(p.side);
        if (isLocal) {
          sound.play("lose");
          this.addShake(0.3);
        } else {
          sound.play("goal");
        }
      }
      this.cPoints.set(id, p.points);

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

    if (localSide >= 0) {
      this.localSide = localSide;
      if (this.cameraSide !== localSide) {
        this.setCameraSide(localSide);
        this.arena?.highlightSide(localSide);
      }
    }

    this.syncEntities(state.entities);
    this.publishStandings(state, localSide);
    this.syncGlobals(state);
  }

  /** Reconcile ball + obstacle meshes against the entity list. */
  private syncEntities(entities: ArrayLike<EntityState>): void {
    const ballEnts: EntityState[] = [];
    const obstEnts: EntityState[] = [];
    for (let i = 0; i < entities.length; i++) {
      const e = entities[i]!;
      if (!e.active) continue;
      if (e.kind === "ball") ballEnts.push(e);
      else if (e.kind === "obstacle") obstEnts.push(e);
    }

    while (this.balls.length < ballEnts.length) {
      const mesh = makeBall(BALL_R);
      this.scene.add(mesh);
      const shadow = makeBlobShadow(BALL_R * 1.5, 0.55);
      this.scene.add(shadow);
      this.balls.push({
        mesh,
        shadow,
        tx: 0,
        ty: BALL_R,
        tz: 0,
        px: 0,
        pz: 0,
        pvx: 0,
        pvz: 0,
        flash: 0,
        squash: 0,
        trailTimer: 0,
      });
    }
    while (this.balls.length > ballEnts.length) {
      const b = this.balls.pop()!;
      this.disposeMesh(b.mesh);
      this.disposeMesh(b.shadow);
    }
    for (let i = 0; i < ballEnts.length; i++) {
      const b = this.balls[i]!;
      const e = ballEnts[i]!;
      // New step velocity; a sharp direction change = a bounce (squash it).
      const nvx = e.x - b.tx;
      const nvz = e.z - b.tz;
      const sp = Math.hypot(nvx, nvz);
      const psp = Math.hypot(b.pvx, b.pvz);
      if (sp > 0.02 && psp > 0.02 && (nvx * b.pvx + nvz * b.pvz) / (sp * psp) < 0.4) {
        b.squash = 1;
      }
      b.pvx = nvx;
      b.pvz = nvz;
      b.px = b.tx;
      b.pz = b.tz;
      b.tx = e.x;
      b.ty = e.y;
      b.tz = e.z;
    }

    while (this.obstacles.length < obstEnts.length) {
      const o = makeObstacle();
      this.scene.add(o.mesh);
      this.obstacles.push({ group: o.mesh, setSolid: o.setSolid });
    }
    while (this.obstacles.length > obstEnts.length) this.scene.remove(this.obstacles.pop()!.group);
    for (let i = 0; i < obstEnts.length; i++) {
      const o = this.obstacles[i]!;
      const e = obstEnts[i]!;
      o.group.position.set(e.x, 0, e.z);
      o.setSolid(e.variant === 1);
    }
  }

  /** Smooth the ball meshes toward their target positions; detect dash blocks. */
  private updateBalls(dt: number): void {
    const k = 1 - Math.exp(-BALL_LERP_K * dt);
    const inward = this.localSide >= 0 ? inwardNormal(this.localSide) : null;
    const localAvatar = this.avatars.get(this.localId);
    for (const b of this.balls) {
      b.mesh.position.x += (b.tx - b.mesh.position.x) * k;
      b.mesh.position.y += (b.ty - b.mesh.position.y) * k;
      b.mesh.position.z += (b.tz - b.mesh.position.z) * k;
      b.mesh.rotation.x += 6 * dt;
      b.mesh.rotation.y += 4 * dt;

      // Contact shadow tracks the ball on the floor.
      b.shadow.position.set(b.mesh.position.x, 0.06, b.mesh.position.z);

      // Squash/stretch on bounce.
      if (b.squash > 0) {
        const q = b.squash;
        b.mesh.scale.set(1 + 0.22 * q, 1 - 0.3 * q, 1 + 0.22 * q);
        b.squash = Math.max(0, b.squash - dt * 6);
      } else {
        b.mesh.scale.set(1, 1, 1);
      }

      // Motion trail when moving fast (state runs at 30 Hz).
      const speed = Math.hypot(b.pvx, b.pvz) * 30;
      b.trailTimer -= dt;
      if (speed > 9 && b.trailTimer <= 0) {
        b.trailTimer = 0.035;
        this.spawnTrail(b.mesh.position);
      }

      // Dash block: during the dash window, a ball near the local paddle now
      // heading inward = a strong block; flash + shake + pop.
      if (this.dashWindow > 0 && inward && localAvatar) {
        const vx = b.tx - b.px;
        const vz = b.tz - b.pz;
        const near = Math.hypot(b.tx - localAvatar.position.x, b.tz - localAvatar.position.z) < 3.2;
        const heading = vx * inward.x + vz * inward.z > 0.02;
        if (near && heading) {
          b.flash = 1;
          this.addShake(0.32);
          sound.play("goal");
          this.dashWindow = 0;
        }
      }

      const mat = b.mesh.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 0.45 + b.flash * 1.8;
      const col = mat.emissive;
      if (b.flash > 0) {
        col.setHex(0xc6ffdd);
        b.flash = Math.max(0, b.flash - dt * 3);
      } else {
        col.setHex(0x37d97a);
      }
    }
  }

  private updateEffects(dt: number): void {
    if (this.dashWindow > 0) this.dashWindow = Math.max(0, this.dashWindow - dt);
    if (this.dashCdClient > 0) this.dashCdClient = Math.max(0, this.dashCdClient - dt);

    // Local lunge: a quick scale pop on the local avatar.
    const localAvatar = this.avatars.get(this.localId);
    if (localAvatar) {
      const s = 1 + 0.22 * this.dashPulse;
      localAvatar.object3d.scale.setScalar(s);
    }
    if (this.dashPulse > 0) this.dashPulse = Math.max(0, this.dashPulse - dt * 4);

    for (let i = this.shocks.length - 1; i >= 0; i--) {
      const s = this.shocks[i]!;
      s.ttl -= dt;
      const k = Math.max(0, s.ttl / s.max);
      const sc = 1 + (1 - k) * 5;
      s.mesh.scale.set(sc, sc, sc);
      (s.mesh.material as THREE.MeshBasicMaterial).opacity = k * 0.7;
      if (s.ttl <= 0) {
        this.disposeMesh(s.mesh);
        this.shocks.splice(i, 1);
      }
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]!;
      p.ttl -= dt;
      p.vy -= 9 * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, p.ttl / 0.45);
      if (p.ttl <= 0) {
        this.disposeMesh(p.mesh);
        this.particles.splice(i, 1);
      }
    }
    for (let i = this.trails.length - 1; i >= 0; i--) {
      const tr = this.trails[i]!;
      tr.ttl -= dt;
      (tr.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, tr.ttl / 0.22) * 0.5;
      tr.mesh.scale.multiplyScalar(1 - dt * 2.5);
      if (tr.ttl <= 0) {
        this.disposeMesh(tr.mesh);
        this.trails.splice(i, 1);
      }
    }
  }

  private spawnTrail(pos: THREE.Vector3): void {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(BALL_R * 0.7, 12, 8),
      new THREE.MeshBasicMaterial({
        color: 0x4fe08a,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
      }),
    );
    m.position.copy(pos);
    this.scene.add(m);
    this.trails.push({ mesh: m, ttl: 0.22 });
  }

  private triggerDash(): void {
    const a = this.avatars.get(this.localId);
    if (!a) return;
    this.dashPulse = 1;
    this.dashWindow = 0.3;
    sound.play("shoot");
    // Shockwave ring at the avatar's feet.
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.3, 0.5, 32),
      new THREE.MeshBasicMaterial({
        color: 0x7cf0a8,
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(a.position.x, 0.2, a.position.z);
    this.scene.add(ring);
    this.shocks.push({ mesh: ring, ttl: 0.5, max: 0.5 });
    // Particle burst.
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.12, 0.12),
        new THREE.MeshBasicMaterial({ color: 0x9cf7c4, transparent: true, opacity: 1 }),
      );
      m.position.set(a.position.x, 0.6, a.position.z);
      this.scene.add(m);
      const ang = Math.random() * Math.PI * 2;
      const sp = 3 + Math.random() * 3;
      this.particles.push({
        mesh: m,
        vx: Math.cos(ang) * sp,
        vy: 2 + Math.random() * 2,
        vz: Math.sin(ang) * sp,
        ttl: 0.45,
      });
    }
  }

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
        if (isLocal) this.addShake(0.5);
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
    this.cameraRig.camera.position.copy(this.camDesired);
    this.cameraRig.camera.lookAt(CENTER);
  }

  private addShake(mag: number): void {
    this.shake = Math.min(0.6, this.shake + mag);
  }

  private updateCamera(dt: number): void {
    const cam = this.cameraRig.camera;
    cam.position.lerp(this.camDesired, 1 - Math.exp(-6 * dt));
    if (this.shake > 0.001) {
      cam.position.x += (Math.random() - 0.5) * this.shake * 2;
      cam.position.y += (Math.random() - 0.5) * this.shake * 2;
      this.shake *= Math.exp(-8 * dt);
    } else {
      this.shake = 0;
    }
    cam.lookAt(CENTER);
  }

  // --- input ---------------------------------------------------------------

  private sampleInput(): InputIntent {
    const slide = (this.input.isActive("right") ? 1 : 0) - (this.input.isActive("left") ? 1 : 0);
    const dash = this.input.isActive("jump") || this.input.isActive("action");
    if (dash && !this.prevInputDash && this.dashCdClient <= 0 && this.matchPhase === "playing") {
      this.dashCdClient = DASH_CD;
      this.triggerDash();
    }
    this.prevInputDash = dash;
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
