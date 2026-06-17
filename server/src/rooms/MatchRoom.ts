import { Room, type Client } from "@colyseus/core";
import RAPIER from "@dimforge/rapier3d-compat";
import {
  ARENA,
  CHARACTER_IDS,
  INPUT_MESSAGE,
  MAX_PLAYERS,
  PHYS,
  PLACE_POINTS,
  TICK_RATE,
  isValidCharacter,
  spawnPoint,
  type InputIntent,
  type JoinOptions,
} from "@party-royale/shared";
import { PhysicsWorld } from "../physics/PhysicsWorld";
import { PlayerSim } from "../physics/PlayerSim";
import { BotController } from "../ai/BotController";
import { buildRoundPlan } from "../match/MinigameRegistry";
import type { IMinigame, MinigameContext } from "../match/IMinigame";
import { recordMatchResult, type Participant } from "../services/leaderboard";
import { EntityState, MatchState, PlayerState } from "./schema";

/** Lobby fill window once the first human joins (seconds). */
const FILL_WAIT = 8;
const COUNTDOWN = 4;
const INTRO_TIME = 3.5;
const END_SCREEN = 14;
const MIN_HUMANS = 1;
/** Generous cap above the ~30 Hz client send rate; excess input is dropped. */
const MAX_INPUTS_PER_SECOND = 90;

type Phase = "waiting" | "countdown" | "intro" | "playing" | "ended";

/**
 * Authoritative match room. Everyone plays every minigame in order; each round
 * awards placement points by the players' round scores, and the highest total
 * across all rounds wins. There is no elimination — every player plays to the
 * end. All scoring, round transitions, and the winner are decided here; clients
 * only send input intents.
 */
export class MatchRoom extends Room<MatchState> {
  override maxClients = MAX_PLAYERS;

  private physics!: PhysicsWorld;
  private readonly sims = new Map<string, PlayerSim>();
  private readonly bots = new Map<string, BotController>();
  private readonly inputRate = new Map<string, { windowStart: number; count: number }>();
  private readonly actionEdge = new Map<string, boolean>();
  private readonly lastAction = new Map<string, boolean>();
  private readonly botOrder = new Map<string, number>();
  private ctx!: MinigameContext;
  private platformCollider: RAPIER.Collider | null = null;
  private bannerTimer = 0;

  private spawnCounter = 0;
  private botCounter = 0;
  private botSeq = 0;
  private colorCounter = 0;

  private fillTimer = FILL_WAIT;
  private phaseTimer = 0;
  private roundIndex = 0;
  private roundElapsed = 0;
  private matchClock = 0;
  private minigame: IMinigame | null = null;
  private roundPlan: IMinigame[] = [];

  override async onCreate(): Promise<void> {
    this.state = new MatchState();
    this.state.phase = "waiting";

    this.physics = await PhysicsWorld.create(PHYS.gravity, 1 / TICK_RATE);
    this.setPlatformEnabled(true);

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
      facing: (id) => {
        const yaw = this.sims.get(id)?.yaw ?? 0;
        return { x: Math.sin(yaw), z: Math.cos(yaw) };
      },
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

    this.onMessage(INPUT_MESSAGE, (client, message: InputIntent) => {
      if (this.state.phase === "ended") return;
      if (!this.allowInput(client.sessionId)) return; // rate limit / anti-flood
      const input = sanitizeInput(message);
      this.sims.get(client.sessionId)?.setInput(input);
      const prev = this.lastAction.get(client.sessionId) ?? false;
      if (input.action && !prev) this.actionEdge.set(client.sessionId, true);
      this.lastAction.set(client.sessionId, input.action);
    });

    this.setSimulationInterval((deltaMs) => this.update(deltaMs), 1000 / TICK_RATE);
  }

  override onJoin(client: Client, options?: JoinOptions): void {
    const spawn = spawnPoint(this.spawnCounter++, MAX_PLAYERS);
    this.sims.set(client.sessionId, new PlayerSim(this.physics, spawn));

    const player = new PlayerState();
    player.name = sanitizeName(options?.name) ?? `Player-${this.spawnCounter}`;
    player.wallet = typeof options?.wallet === "string" ? options.wallet.slice(0, 64) : "";
    player.character = isValidCharacter(options?.character) ? options.character : "knight";
    player.colorIndex = this.colorCounter++;
    player.x = spawn.x;
    player.y = spawn.y;
    player.z = spawn.z;
    this.state.players.set(client.sessionId, player);
    this.state.alive = this.sims.size;

    console.log(`[match ${this.roomId}] join ${client.sessionId} (${player.name})`);
  }

  override onLeave(client: Client): void {
    this.removeSim(client.sessionId);
    this.state.players.delete(client.sessionId);
    this.state.alive = this.sims.size;
    console.log(`[match ${this.roomId}] leave ${client.sessionId}`);
  }

  override onDispose(): void {
    this.physics?.dispose();
  }

  // --- main loop -----------------------------------------------------------

  private update(deltaMs: number): void {
    const dt = deltaMs / 1000;
    this.simulate(dt);

    switch (this.state.phase as Phase) {
      case "waiting":
        this.updateWaiting(dt);
        break;
      case "countdown":
        this.updateCountdown(dt);
        break;
      case "intro":
        this.updateIntro(dt);
        break;
      case "playing":
        this.updatePlaying(dt);
        break;
      case "ended":
        this.updateEnded(dt);
        break;
    }
  }

  /** Step physics for all sims and publish transforms. */
  private simulate(dt: number): void {
    const allowRespawn =
      this.state.phase === "waiting" ||
      this.state.phase === "countdown" ||
      this.state.phase === "intro";

    const playing = this.state.phase === "playing";
    for (const [id, sim] of this.sims) {
      const ai = this.bots.get(id);
      if (ai) {
        const plan =
          playing && this.minigame?.botPlan
            ? this.minigame.botPlan(id, this.ctx, dt)
            : { tx: 0, tz: 0 };
        const intent = ai.think(sim, plan, this.physics, dt, this.botSeq++);
        sim.setInput(intent);
        // Bots get the same action-edge treatment as human input.
        const prev = this.lastAction.get(id) ?? false;
        if (intent.action && !prev) this.actionEdge.set(id, true);
        this.lastAction.set(id, intent.action);
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

  private updateWaiting(dt: number): void {
    const humans = this.clients.length;
    if (humans < MIN_HUMANS) {
      this.fillTimer = FILL_WAIT;
      this.state.timer = 0;
      return;
    }
    this.fillTimer -= dt;
    this.state.timer = Math.max(0, Math.ceil(this.fillTimer));
    if (humans >= MAX_PLAYERS || this.fillTimer <= 0) this.startMatch();
  }

  private updateCountdown(dt: number): void {
    this.phaseTimer -= dt;
    this.state.timer = Math.max(0, Math.ceil(this.phaseTimer));
    if (this.phaseTimer <= 0) {
      this.roundIndex = 0;
      this.startRound(); // enters the "intro" phase
    }
  }

  private updateIntro(dt: number): void {
    this.phaseTimer -= dt;
    this.state.timer = Math.max(0, Math.ceil(this.phaseTimer));
    if (this.phaseTimer <= 0) {
      this.state.phase = "playing";
      this.roundElapsed = 0;
      this.state.roundClock = 0;
    }
  }

  private updatePlaying(dt: number): void {
    if (!this.minigame) return;
    this.roundElapsed += dt;
    this.matchClock += dt;
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
      else this.nextRound();
    }
  }

  private updateEnded(dt: number): void {
    this.phaseTimer -= dt;
    this.state.timer = Math.max(0, Math.ceil(this.phaseTimer));
    if (this.phaseTimer <= 0) void this.disconnect();
  }

  // --- transitions ---------------------------------------------------------

  private startMatch(): void {
    this.lock();
    this.autoDispose = false;
    this.matchClock = 0;
    while (this.sims.size < MAX_PLAYERS) this.addBot();
    this.roundPlan = buildRoundPlan(this.sims.size);
    this.state.roundCount = this.roundPlan.length;
    this.state.phase = "countdown";
    this.phaseTimer = COUNTDOWN;
    this.state.alive = this.sims.size;
    console.log(`[match ${this.roomId}] starting with ${this.sims.size} players`);
  }

  private startRound(): void {
    this.minigame?.teardown(this.ctx);
    this.clearEntities();
    const idx = Math.min(this.roundIndex, this.roundPlan.length - 1);
    this.minigame = this.roundPlan[idx]!;
    this.roundElapsed = 0;
    this.state.roundClock = 0;
    this.state.round = this.roundIndex + 1;
    // Fresh round: everyone starts at zero score / no team, banner cleared.
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
    console.log(`[match ${this.roomId}] round ${this.state.round}: ${this.minigame.name}`);
  }

  private nextRound(): void {
    this.roundIndex += 1;
    this.startRound();
  }

  /**
   * Turn this round's scores into placement points. Players who scored nothing
   * (roundScore <= 0) get 0; the rest are ranked by score, and tied scores split
   * the averaged points for the ranks they span (so teammates with an equal team
   * score get equal points, and climb non-finishers get nothing).
   */
  private awardPoints(): void {
    const positives = [...this.sims.keys()]
      .filter((id) => (this.state.players.get(id)?.roundScore ?? 0) > 0)
      .sort(
        (a, b) =>
          (this.state.players.get(b)?.roundScore ?? 0) -
          (this.state.players.get(a)?.roundScore ?? 0),
      );
    const ptsAt = (rank: number): number => PLACE_POINTS[Math.min(rank, PLACE_POINTS.length - 1)] ?? 0;
    let i = 0;
    while (i < positives.length) {
      const score = this.state.players.get(positives[i]!)?.roundScore ?? 0;
      let j = i;
      while (j < positives.length && (this.state.players.get(positives[j]!)?.roundScore ?? 0) === score) {
        j++;
      }
      // Ranks [i, j) tie: each gets the average of their placement points.
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

    // Final placement by total points.
    const ranked = [...this.state.players.keys()].sort(
      (a, b) => (this.state.players.get(b)?.points ?? 0) - (this.state.players.get(a)?.points ?? 0),
    );
    let winnerWallet: string | null = null;
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
        if (!winner.isBot && winner.wallet) winnerWallet = winner.wallet;
      }
    }
    this.state.alive = this.sims.size;
    console.log(`[match ${this.roomId}] winner: ${this.state.winnerName || "(none)"}`);

    const participants: Participant[] = [];
    this.state.players.forEach((p) => {
      if (!p.isBot && p.wallet) {
        participants.push({ wallet: p.wallet, name: p.name, placement: p.placement });
      }
    });
    if (participants.length > 0) {
      recordMatchResult(this.roomId, participants, winnerWallet, this.matchClock).catch((err) =>
        console.error(`[match ${this.roomId}] failed to record result`, err),
      );
    }
  }

  // --- helpers -------------------------------------------------------------

  private addBot(): void {
    const id = `bot-${++this.botCounter}`;
    const spawn = spawnPoint(this.spawnCounter++, MAX_PLAYERS);
    this.sims.set(id, new PlayerSim(this.physics, spawn));
    this.bots.set(id, new BotController());
    this.botOrder.set(id, this.botOrder.size);

    const player = new PlayerState();
    player.name = `Bot-${this.botCounter}`;
    player.isBot = true;
    player.character = CHARACTER_IDS[this.botCounter % CHARACTER_IDS.length]!;
    player.colorIndex = this.colorCounter++;
    player.x = spawn.x;
    player.y = spawn.y;
    player.z = spawn.z;
    this.state.players.set(id, player);
  }

  private clearEntities(): void {
    if (this.state.entities.length > 0) this.state.entities.splice(0, this.state.entities.length);
  }

  private removeSim(id: string): void {
    this.sims.get(id)?.destroy();
    this.sims.delete(id);
    this.bots.delete(id);
    this.botOrder.delete(id);
    this.inputRate.delete(id);
    this.actionEdge.delete(id);
    this.lastAction.delete(id);
  }

  /**
   * Per-client input rate limit. Clients sample at ~30 Hz; anything well above
   * that is dropped to blunt flooding. Sanitization plus this cap means a client
   * cannot move the simulation in ways the server does not allow.
   */
  private allowInput(sessionId: string): boolean {
    const now = Date.now();
    const entry = this.inputRate.get(sessionId);
    if (!entry || now - entry.windowStart >= 1000) {
      this.inputRate.set(sessionId, { windowStart: now, count: 1 });
      return true;
    }
    entry.count += 1;
    return entry.count <= MAX_INPUTS_PER_SECOND;
  }

  /** Add or remove the solid base platform collider (minigames build their own floor). */
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
}

function sanitizeInput(msg: InputIntent): InputIntent {
  const clamp = (n: unknown): number => {
    const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
    return Math.max(-1, Math.min(1, v));
  };
  return {
    moveX: clamp(msg?.moveX),
    moveZ: clamp(msg?.moveZ),
    run: Boolean(msg?.run),
    jump: Boolean(msg?.jump),
    dive: Boolean(msg?.dive),
    action: Boolean(msg?.action),
    seq: typeof msg?.seq === "number" && Number.isFinite(msg.seq) ? msg.seq : 0,
  };
}

function sanitizeName(name?: string): string | undefined {
  if (typeof name !== "string") return undefined;
  const trimmed = name.trim().slice(0, 16);
  return trimmed.length > 0 ? trimmed : undefined;
}
