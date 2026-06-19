import { Room, type Client } from "@colyseus/core";
import {
  CHARACTER_IDS,
  EMOTE_MESSAGE,
  EMOTES,
  INPUT_MESSAGE,
  MAX_PLAYERS,
  TICK_RATE,
  isValidCharacter,
  type InputIntent,
  type JoinOptions,
} from "@party-royale/shared";
import { recordMatchResult, type Participant } from "../services/leaderboard";
import {
  PumpDashSim,
  START_POINTS,
  faceYaw,
  sideWorld,
  slideSign,
} from "../pumpdash/PumpDashSim";
import { EntityState, MatchState, PlayerState } from "./schema";

/** Lobby fill window once the first human joins (seconds). */
const FILL_WAIT = 14;
const COUNTDOWN = 4;
const END_SCREEN = 12;
const MIN_HUMANS = 1;
const BALL_Y = 0.7;
/** Generous cap above the ~30 Hz client send rate; excess input is dropped. */
const MAX_INPUTS_PER_SECOND = 90;

/** Human-looking usernames for bots so they read as real players. */
const BOT_NAMES = [
  "Lucas", "Mia", "Noah", "Zoe", "Leo", "Ava", "Max", "Emma", "Theo", "Lily",
  "Hugo", "Nora", "Liam", "Sofia", "Ben", "Cleo", "Finn", "Ruby", "Kai", "Luna",
  "Sam", "Ivy", "Dylan", "Maya", "Jack", "Nina", "Milo", "Ella", "Axel", "Vera",
];

type Phase = "waiting" | "countdown" | "playing" | "ended";

interface PlayerInput {
  slide: number;
  dash: boolean;
}

/**
 * Authoritative PumpDash room. A square arena with four sides; each player guards
 * one side and slides only along their edge. A ball that passes an alive player's
 * edge costs them a point; reaching zero eliminates them. Last player alive wins.
 * Clients only send input intents; all scoring is decided here.
 */
export class MatchRoom extends Room<MatchState> {
  override maxClients = MAX_PLAYERS;

  private readonly sim = new PumpDashSim();
  private readonly inputs = new Map<string, PlayerInput>();
  private readonly inputRate = new Map<string, { windowStart: number; count: number }>();
  private readonly emoteTimers = new Map<string, number>();

  private botCounter = 0;
  private colorCounter = 0;
  private fillTimer = FILL_WAIT;
  private phaseTimer = 0;
  private matchClock = 0;
  private bannerTimer = 0;

  override onCreate(options?: JoinOptions): void {
    this.state = new MatchState();
    this.state.phase = "waiting";
    this.state.minigame = "PumpDash";
    this.state.round = 1;
    this.state.roundCount = 1;
    if (options?.private) this.setPrivate(true);

    this.onMessage(INPUT_MESSAGE, (client, message: InputIntent) => {
      if (this.state.phase === "ended") return;
      if (!this.allowInput(client.sessionId)) return;
      const slide = clamp1(message?.moveX);
      const dash = Boolean(message?.jump) || Boolean(message?.action);
      this.inputs.set(client.sessionId, { slide, dash });
    });

    this.onMessage(EMOTE_MESSAGE, (client, message: { id?: number }) => {
      const id = Math.floor(message?.id ?? -1);
      if (id < 0 || id >= EMOTES.length) return;
      this.showEmote(client.sessionId, id);
    });

    this.setSimulationInterval((deltaMs) => this.update(deltaMs), 1000 / TICK_RATE);
  }

  override onJoin(client: Client, options?: JoinOptions): void {
    const side = this.sim.addPlayer(client.sessionId, false);
    const player = new PlayerState();
    player.name = sanitizeName(options?.name) ?? `Player-${this.sim.players.size}`;
    player.wallet = typeof options?.wallet === "string" ? options.wallet.slice(0, 64) : "";
    player.character = isValidCharacter(options?.character) ? options.character : "knight";
    player.colorIndex = this.colorCounter++;
    player.side = side;
    player.points = START_POINTS;
    this.state.players.set(client.sessionId, player);
    this.placePaddle(client.sessionId);
    this.state.alive = this.sim.players.size;
    console.log(`[match ${this.roomId}] join ${client.sessionId} (${player.name}) side ${side}`);
  }

  override onLeave(client: Client): void {
    this.sim.removePlayer(client.sessionId);
    this.inputs.delete(client.sessionId);
    this.inputRate.delete(client.sessionId);
    this.emoteTimers.delete(client.sessionId);
    this.state.players.delete(client.sessionId);
    this.state.alive = this.sim.players.size;
    console.log(`[match ${this.roomId}] leave ${client.sessionId}`);
  }

  // --- main loop -----------------------------------------------------------

  private update(deltaMs: number): void {
    const dt = deltaMs / 1000;
    this.updateEmotes(dt);
    this.maybeBotEmote(dt);

    switch (this.state.phase as Phase) {
      case "waiting":
        this.updateWaiting(dt);
        this.syncPlayers();
        break;
      case "countdown":
        this.phaseTimer -= dt;
        this.state.timer = Math.max(0, Math.ceil(this.phaseTimer));
        this.syncPlayers();
        if (this.phaseTimer <= 0) {
          this.sim.spawnBalls();
          this.state.phase = "playing";
        }
        break;
      case "playing":
        this.updatePlaying(dt);
        break;
      case "ended":
        this.phaseTimer -= dt;
        this.state.timer = Math.max(0, Math.ceil(this.phaseTimer));
        if (this.phaseTimer <= 0) void this.disconnect();
        break;
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
    if (humans >= MAX_PLAYERS || this.fillTimer <= 0) this.startCountdown();
  }

  private startCountdown(): void {
    this.lock();
    this.autoDispose = false;
    while (this.sim.players.size < MAX_PLAYERS) this.addBot();
    this.state.phase = "countdown";
    this.phaseTimer = COUNTDOWN;
    this.state.alive = this.sim.players.size;
    console.log(`[match ${this.roomId}] starting with ${this.sim.players.size} players`);
  }

  private updatePlaying(dt: number): void {
    for (const p of this.sim.players.values()) {
      if (p.isBot) continue;
      const inp = this.inputs.get(p.id);
      this.sim.setInput(p.id, (inp?.slide ?? 0) * slideSign(p.side), inp?.dash ?? false);
    }
    this.sim.step(dt);
    this.matchClock += dt;
    this.handleEvents();
    this.syncPlayers();
    this.syncEntities();
    this.state.alive = [...this.sim.players.values()].filter((p) => p.alive).length;

    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.state.banner = "";
    }
    if (this.sim.ended) this.endMatch();
  }

  private handleEvents(): void {
    for (const ev of this.sim.events) {
      if (ev.kind === "eliminate") {
        const p = this.state.players.get(ev.playerId);
        if (p) {
          this.state.banner = `${p.name} eliminated`;
          this.bannerTimer = 2.4;
        }
      }
    }
  }

  private endMatch(): void {
    this.state.phase = "ended";
    this.phaseTimer = END_SCREEN;
    const ranked = this.sim.ranking();
    let winnerWallet: string | null = null;
    ranked.forEach((id, rank) => {
      const p = this.state.players.get(id);
      if (!p) return;
      p.placement = rank + 1;
      p.anim = rank === 0 ? "win" : "lose";
    });
    const winnerId = this.sim.winnerId ?? ranked[0];
    if (winnerId) {
      const winner = this.state.players.get(winnerId);
      if (winner) {
        this.state.winnerId = winnerId;
        this.state.winnerName = winner.name;
        if (!winner.isBot && winner.wallet) winnerWallet = winner.wallet;
      }
    }
    this.clearEntities();
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

  // --- sync sim -> schema --------------------------------------------------

  private syncPlayers(): void {
    for (const sp of this.sim.players.values()) {
      const p = this.state.players.get(sp.id);
      if (!p) continue;
      const w = sideWorld(sp.side, sp.t);
      p.x = w.x;
      p.y = 0;
      p.z = w.z;
      p.yaw = faceYaw(sp.side);
      p.side = sp.side;
      p.points = sp.points;
      p.alive = sp.alive;
      p.dashCd = sp.dashCd;
      if (this.state.phase === "ended") continue;
      p.anim = !sp.alive ? "lose" : Math.abs(sp.vt) > 0.6 ? "run" : "idle";
    }
  }

  private placePaddle(id: string): void {
    const sp = this.sim.players.get(id);
    const p = this.state.players.get(id);
    if (!sp || !p) return;
    const w = sideWorld(sp.side, sp.t);
    p.x = w.x;
    p.z = w.z;
    p.yaw = faceYaw(sp.side);
  }

  private syncEntities(): void {
    const balls = this.sim.balls;
    const obs = this.sim.obstacles;
    const total = balls.length + obs.length;
    const ents = this.state.entities;
    while (ents.length < total) ents.push(new EntityState());
    while (ents.length > total) ents.pop();
    for (let i = 0; i < balls.length; i++) {
      const e = ents[i]!;
      e.kind = "ball";
      e.x = balls[i]!.x;
      e.y = BALL_Y;
      e.z = balls[i]!.z;
      e.active = true;
      e.variant = 0;
    }
    for (let j = 0; j < obs.length; j++) {
      const e = ents[balls.length + j]!;
      const o = obs[j]!;
      e.kind = "obstacle";
      e.x = o.x;
      e.y = 0.1;
      e.z = o.z;
      e.active = true;
      e.variant = PumpDashSim.isSolid(o) ? 1 : 0;
    }
  }

  // --- helpers -------------------------------------------------------------

  private addBot(): void {
    const id = `bot-${++this.botCounter}`;
    const side = this.sim.addPlayer(id, true);
    const player = new PlayerState();
    player.name = this.pickBotName();
    player.isBot = true;
    player.character = CHARACTER_IDS[this.botCounter % CHARACTER_IDS.length]!;
    player.colorIndex = this.colorCounter++;
    player.side = side;
    player.points = START_POINTS;
    this.state.players.set(id, player);
    this.placePaddle(id);
  }

  private pickBotName(): string {
    const taken = new Set<string>();
    this.state.players.forEach((p) => taken.add(p.name));
    const free = BOT_NAMES.filter((n) => !taken.has(n));
    if (free.length > 0) return free[Math.floor(Math.random() * free.length)]!;
    const base = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)]!;
    return `${base}${Math.floor(Math.random() * 90) + 10}`;
  }

  private showEmote(id: string, emoteId: number): void {
    const player = this.state.players.get(id);
    if (!player) return;
    player.emote = EMOTES[emoteId]!;
    this.emoteTimers.set(id, 2.5);
  }

  private maybeBotEmote(dt: number): void {
    if (this.state.phase !== "playing" && this.state.phase !== "waiting") return;
    for (const sp of this.sim.players.values()) {
      if (!sp.isBot || this.emoteTimers.has(sp.id)) continue;
      if (Math.random() < dt / 45) this.showEmote(sp.id, Math.floor(Math.random() * EMOTES.length));
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
}

function clamp1(n: unknown): number {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return Math.max(-1, Math.min(1, v));
}

function sanitizeName(name?: string): string | undefined {
  if (typeof name !== "string") return undefined;
  const trimmed = name.trim().slice(0, 16);
  return trimmed.length > 0 ? trimmed : undefined;
}
