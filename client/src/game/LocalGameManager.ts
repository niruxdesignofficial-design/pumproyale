import {
  ARENA,
  CHARACTER_IDS,
  EMOTES,
  MAX_PLAYERS,
  PHYS,
  PLACE_POINTS,
  TICK_RATE,
  isValidCharacter,
  lobbyMap,
  spawnPoint,
  type InputIntent,
} from "@party-royale/shared";
import RAPIER from "@dimforge/rapier3d-compat";
import { PhysicsWorld } from "@engine/physics/PhysicsWorld";
import { PlayerSim } from "@engine/physics/PlayerSim";
import { BotController } from "@engine/ai/BotController";
import { buildRoundPlan } from "@engine/match/MinigameRegistry";
import type { IMinigame, MinigameContext } from "@engine/match/IMinigame";
import { buildMapColliders, removeColliders } from "@engine/match/mapColliders";
import { EntityState, MatchState, PlayerState } from "@engine/rooms/schema";
import { pickBotName } from "./botNames";
import { randomWallet } from "./fakeWallet";
import { recordLocalResult } from "./localLeaderboard";

const COUNTDOWN = 4;
const INTRO_TIME = 3.5;
const END_SCREEN = 14;
/** "Searching for players" window (s) before the match starts — feels like matchmaking. */
const MATCHMAKING_MIN = 1.5;
const MATCHMAKING_MAX = 4;
const STEP = 1 / TICK_RATE;

type Phase = "matchmaking" | "countdown" | "intro" | "playing" | "ended";

/**
 * Offline, in-browser replacement for the Colyseus client + room. Runs the exact
 * authoritative match simulation (physics, the four minigames, bot AI) locally with
 * one human + three bots, exposing a `MatchState` the renderer reads. No network.
 */
export class LocalGameManager {
  readonly localId = "local";
  state = new MatchState();

  private physics!: PhysicsWorld;
  private ctx!: MinigameContext;
  private readonly sims = new Map<string, PlayerSim>();
  private readonly bots = new Map<string, BotController>();
  private readonly botOrder = new Map<string, number>();
  private readonly actionEdge = new Map<string, boolean>();
  private readonly lastAction = new Map<string, boolean>();
  private readonly emoteTimers = new Map<string, number>();
  private localInput: InputIntent = {
    moveX: 0,
    moveZ: 0,
    run: false,
    jump: false,
    dive: false,
    action: false,
    seq: 0,
  };

  private platformCollider: RAPIER.Collider | null = null;
  private lobbyColliders: RAPIER.Collider[] = [];
  private bannerTimer = 0;
  private spawnCounter = 0;
  private botCounter = 0;
  private botSeq = 0;
  private colorCounter = 0;
  private phaseTimer = 0;
  private roundIndex = 0;
  private roundElapsed = 0;
  private roundPlan: IMinigame[] = [];
  private minigame: IMinigame | null = null;
  private acc = 0;
  private recorded = false;

  constructor(
    private readonly opts: { name: string; character: string; wallet: string | null },
  ) {}

  /** Boot Rapier, build the lobby, spawn the human + bots, enter matchmaking. */
  async start(): Promise<void> {
    this.physics = await PhysicsWorld.create(PHYS.gravity, STEP);
    this.buildContext();

    // Lobby parkour while "searching" (the human can move; bots mill around).
    this.setPlatformEnabled(false);
    this.lobbyColliders = buildMapColliders(this.physics, lobbyMap());

    this.spawnLocal();
    while (this.sims.size < MAX_PLAYERS) this.addBot();

    this.state.phase = "matchmaking";
    this.phaseTimer = MATCHMAKING_MIN + Math.random() * (MATCHMAKING_MAX - MATCHMAKING_MIN);
    this.state.timer = Math.ceil(this.phaseTimer);
    this.state.alive = this.sims.size;
  }

  setLocalInput(intent: InputIntent): void {
    this.localInput = intent;
  }

  sendEmote(id: number): void {
    if (id >= 0 && id < EMOTES.length) this.showEmote(this.localId, id);
  }

  dispose(): void {
    for (const sim of this.sims.values()) sim.destroy();
    this.sims.clear();
    this.physics?.dispose();
  }

  /** Advance the simulation by real time, stepped at a fixed 1/30s. */
  step(dt: number): void {
    if (!this.physics) return;
    this.acc += Math.min(dt, 0.1);
    while (this.acc >= STEP) {
      this.tick(STEP);
      this.acc -= STEP;
    }
  }

  // --- main loop (ported from MatchRoom) -----------------------------------

  private tick(dt: number): void {
    this.simulate(dt);
    this.updateEmotes(dt);
    this.maybeBotEmote(dt);

    switch (this.state.phase as Phase) {
      case "matchmaking":
        this.phaseTimer -= dt;
        this.state.timer = Math.max(0, Math.ceil(this.phaseTimer));
        if (this.phaseTimer <= 0) this.startMatch();
        break;
      case "countdown":
        this.phaseTimer -= dt;
        this.state.timer = Math.max(0, Math.ceil(this.phaseTimer));
        if (this.phaseTimer <= 0) {
          this.roundIndex = 0;
          this.startRound();
        }
        break;
      case "intro":
        this.phaseTimer -= dt;
        this.state.timer = Math.max(0, Math.ceil(this.phaseTimer));
        if (this.phaseTimer <= 0) {
          this.state.phase = "playing";
          this.roundElapsed = 0;
          this.state.roundClock = 0;
        }
        break;
      case "playing":
        this.updatePlaying(dt);
        break;
      case "ended":
        this.phaseTimer -= dt;
        this.state.timer = Math.max(0, Math.ceil(this.phaseTimer));
        break;
    }
  }

  private simulate(dt: number): void {
    const phase = this.state.phase as Phase;
    const allowRespawn = phase === "matchmaking" || phase === "countdown" || phase === "intro";
    const playing = phase === "playing";

    for (const [id, sim] of this.sims) {
      const ai = this.bots.get(id);
      if (ai) {
        const plan =
          playing && this.minigame?.botPlan ? this.minigame.botPlan(id, this.ctx, dt) : { tx: 0, tz: 0 };
        const intent = ai.think(sim, plan, this.physics, dt, this.botSeq++);
        sim.setInput(intent);
        const prev = this.lastAction.get(id) ?? false;
        if (intent.action && !prev) this.actionEdge.set(id, true);
        this.lastAction.set(id, intent.action);
      } else {
        // The human.
        sim.setInput(this.localInput);
        const prev = this.lastAction.get(id) ?? false;
        if (this.localInput.action && !prev) this.actionEdge.set(id, true);
        this.lastAction.set(id, this.localInput.action);
      }
      sim.preStep(dt);
    }

    this.physics.step();

    for (const [id, sim] of this.sims) {
      sim.postStep();
      if (allowRespawn && sim.fellOff) sim.respawn();
      const player = this.state.players.get(id);
      if (!player) continue;
      const p = sim.position;
      player.x = p.x;
      player.y = p.y;
      player.z = p.z;
      player.yaw = sim.yaw;
      player.anim = sim.animState();
    }
  }

  private updatePlaying(dt: number): void {
    if (!this.minigame) return;
    this.roundElapsed += dt;
    this.state.roundClock = this.roundElapsed;
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.state.banner = "";
    }
    this.minigame.update(this.ctx, dt);
    this.state.timer = Math.max(0, Math.ceil(this.minigame.maxDuration - this.roundElapsed));
    if (this.minigame.isComplete(this.ctx)) {
      this.awardPoints();
      if (this.roundIndex >= this.roundPlan.length - 1) this.endMatch();
      else {
        this.roundIndex += 1;
        this.startRound();
      }
    }
  }

  // --- transitions ---------------------------------------------------------

  private startMatch(): void {
    removeColliders(this.physics, this.lobbyColliders);
    this.lobbyColliders = [];
    this.setPlatformEnabled(true);
    this.roundPlan = buildRoundPlan(this.sims.size);
    this.state.roundCount = this.roundPlan.length;
    this.state.phase = "countdown";
    this.phaseTimer = COUNTDOWN;
    this.state.alive = this.sims.size;
  }

  private startRound(): void {
    this.minigame?.teardown(this.ctx);
    this.clearEntities();
    const idx = Math.min(this.roundIndex, this.roundPlan.length - 1);
    this.minigame = this.roundPlan[idx]!;
    this.roundElapsed = 0;
    this.state.roundClock = 0;
    this.state.round = this.roundIndex + 1;
    this.state.players.forEach((p) => {
      p.roundScore = 0;
      p.team = -1;
    });
    this.state.banner = "";
    this.bannerTimer = 0;
    this.actionEdge.clear();
    this.lastAction.clear();
    this.minigame.setup(this.ctx);
    this.state.phase = "intro";
    this.phaseTimer = INTRO_TIME;
  }

  /** Turn the round's scores into placement points (tie-aware; zero for zero). */
  private awardPoints(): void {
    const positives = [...this.sims.keys()]
      .filter((id) => (this.state.players.get(id)?.roundScore ?? 0) > 0)
      .sort(
        (a, b) =>
          (this.state.players.get(b)?.roundScore ?? 0) - (this.state.players.get(a)?.roundScore ?? 0),
      );
    const ptsAt = (rank: number): number => PLACE_POINTS[Math.min(rank, PLACE_POINTS.length - 1)] ?? 0;
    let i = 0;
    while (i < positives.length) {
      const score = this.state.players.get(positives[i]!)?.roundScore ?? 0;
      let j = i;
      while (j < positives.length && (this.state.players.get(positives[j]!)?.roundScore ?? 0) === score) {
        j++;
      }
      let sum = 0;
      for (let r = i; r < j; r++) sum += ptsAt(r);
      const avg = Math.round(sum / (j - i));
      for (let r = i; r < j; r++) {
        const p = this.state.players.get(positives[r]!);
        if (p) p.points += avg;
      }
      i = j;
    }
  }

  private endMatch(): void {
    this.minigame?.teardown(this.ctx);
    this.minigame = null;
    this.clearEntities();
    this.state.phase = "ended";
    this.phaseTimer = END_SCREEN;

    const ranked = [...this.state.players.keys()].sort(
      (a, b) => (this.state.players.get(b)?.points ?? 0) - (this.state.players.get(a)?.points ?? 0),
    );
    ranked.forEach((id, rank) => {
      const p = this.state.players.get(id);
      if (!p) return;
      p.placement = rank + 1;
      p.anim = rank === 0 ? "win" : "lose";
    });
    const winnerId = ranked[0];
    if (winnerId) {
      const winner = this.state.players.get(winnerId);
      if (winner) {
        this.state.winnerId = winnerId;
        this.state.winnerName = winner.name;
      }
    }
    this.state.alive = this.sims.size;

    // Fold this match into the simulated leaderboard (offline; no real funds).
    if (!this.recorded) {
      this.recorded = true;
      const me = this.state.players.get(this.localId);
      if (me) recordLocalResult(me.name, this.opts.wallet, me.points, me.placement);
    }
  }

  // --- spawning / helpers (ported) ----------------------------------------

  private spawnLocal(): void {
    const spawn = lobbyMap().spawns[0] ?? { x: 0, y: 2, z: 6 };
    this.sims.set(this.localId, new PlayerSim(this.physics, spawn));
    const player = new PlayerState();
    player.name = this.opts.name || "You";
    player.wallet = this.opts.wallet ?? "";
    player.character = isValidCharacter(this.opts.character) ? this.opts.character : "knight";
    player.colorIndex = this.colorCounter++;
    player.x = spawn.x;
    player.y = spawn.y;
    player.z = spawn.z;
    this.state.players.set(this.localId, player);
    this.spawnCounter++;
  }

  private addBot(): void {
    const id = `bot-${++this.botCounter}`;
    const spawn = spawnPoint(this.spawnCounter++, MAX_PLAYERS);
    this.sims.set(id, new PlayerSim(this.physics, spawn));
    this.bots.set(id, new BotController());
    this.botOrder.set(id, this.botOrder.size);

    const player = new PlayerState();
    player.name = pickBotName(this.takenNames());
    player.isBot = true;
    player.wallet = randomWallet();
    player.character = CHARACTER_IDS[this.botCounter % CHARACTER_IDS.length]!;
    player.colorIndex = this.colorCounter++;
    player.x = spawn.x;
    player.y = spawn.y;
    player.z = spawn.z;
    this.state.players.set(id, player);
  }

  private takenNames(): Set<string> {
    const taken = new Set<string>();
    this.state.players.forEach((p) => taken.add(p.name));
    return taken;
  }

  private showEmote(id: string, emoteId: number): void {
    const player = this.state.players.get(id);
    if (!player) return;
    player.emote = EMOTES[emoteId]!;
    this.emoteTimers.set(id, 2.5);
  }

  private maybeBotEmote(dt: number): void {
    if (this.state.phase !== "playing" && this.state.phase !== "matchmaking") return;
    for (const id of this.bots.keys()) {
      if (this.emoteTimers.has(id)) continue;
      if (Math.random() < dt / 40) this.showEmote(id, Math.floor(Math.random() * EMOTES.length));
    }
  }

  private updateEmotes(dt: number): void {
    for (const [id, t] of this.emoteTimers) {
      const next = t - dt;
      if (next <= 0) {
        this.emoteTimers.delete(id);
        const p = this.state.players.get(id);
        if (p) p.emote = "";
      } else {
        this.emoteTimers.set(id, next);
      }
    }
  }

  private clearEntities(): void {
    if (this.state.entities.length > 0) this.state.entities.splice(0, this.state.entities.length);
  }

  private setPlatformEnabled(enabled: boolean): void {
    if (enabled && !this.platformCollider) {
      this.platformCollider = this.physics.world.createCollider(
        RAPIER.ColliderDesc.cuboid(
          ARENA.platformHalf,
          ARENA.platformThickness / 2,
          ARENA.platformHalf,
        ).setTranslation(0, -ARENA.platformThickness / 2, 0),
      );
    } else if (!enabled && this.platformCollider) {
      this.physics.world.removeCollider(this.platformCollider, false);
      this.platformCollider = null;
    }
  }

  /** The exact MinigameContext from MatchRoom, backed by local state. */
  private buildContext(): void {
    this.ctx = {
      physics: this.physics,
      state: this.state,
      sims: this.sims,
      players: () => [...this.sims.keys()],
      addScore: (id, delta) => {
        const p = this.state.players.get(id);
        if (p) p.roundScore += delta;
      },
      setScore: (id, score) => {
        const p = this.state.players.get(id);
        if (p) p.roundScore = score;
      },
      getScore: (id) => this.state.players.get(id)?.roundScore ?? 0,
      consumeAction: (id) => {
        const v = this.actionEdge.get(id) ?? false;
        if (v) this.actionEdge.set(id, false);
        return v;
      },
      actionHeld: (id) => this.lastAction.get(id) ?? false,
      facing: (id) => {
        const yaw = this.sims.get(id)?.yaw ?? 0;
        return { x: Math.sin(yaw), z: Math.cos(yaw) };
      },
      aim: (id) => this.sims.get(id)?.aim ?? { x: 0, z: 1 },
      addEntity: (kind, variant = 0) => {
        const e = new EntityState();
        e.kind = kind;
        e.variant = variant;
        this.state.entities.push(e);
        return e;
      },
      setPlatformEnabled: (enabled) => this.setPlatformEnabled(enabled),
      setBanner: (text) => {
        this.state.banner = text;
        this.bannerTimer = 2.6;
      },
      botIndex: (id) => this.botOrder.get(id) ?? 0,
    };
  }
}
