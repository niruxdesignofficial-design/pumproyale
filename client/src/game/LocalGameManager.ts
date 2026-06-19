import {
  CHARACTER_IDS,
  EMOTES,
  MAX_PLAYERS,
  TICK_RATE,
  isValidCharacter,
  type InputIntent,
} from "@party-royale/shared";
import { EntityState, MatchState, PlayerState } from "@engine/rooms/schema";
import {
  PumpDashSim,
  START_POINTS,
  faceYaw,
  sideWorld,
  slideSign,
} from "@engine/pumpdash/PumpDashSim";
import { pickBotName } from "./botNames";
import { randomWallet } from "./fakeWallet";
import { recordLocalResult } from "./localLeaderboard";

const COUNTDOWN = 4;
const END_SCREEN = 12;
/** "Searching for players" window (s) before the match starts — feels like matchmaking. */
const MATCHMAKING_MIN = 1.5;
const MATCHMAKING_MAX = 4;
const STEP = 1 / TICK_RATE;
const BALL_Y = 0.7;

type Phase = "matchmaking" | "countdown" | "playing" | "ended";

/**
 * Offline, in-browser PumpDash host. Runs the same authoritative PumpDashSim the
 * server runs (one human + three bots), exposing a `MatchState` the renderer
 * reads. No network.
 */
export class LocalGameManager {
  readonly localId = "local";
  state = new MatchState();

  private readonly sim = new PumpDashSim();
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

  private localSide = 1;
  private phaseTimer = 0;
  private acc = 0;
  private recorded = false;
  private bannerTimer = 0;
  private botCounter = 0;
  private colorCounter = 0;

  constructor(
    private readonly opts: { name: string; character: string; wallet: string | null },
  ) {}

  /** Spawn the human + bots and enter matchmaking. */
  async start(): Promise<void> {
    this.localSide = this.addLocal();
    while (this.sim.players.size < MAX_PLAYERS) this.addBot();
    this.state.minigame = "PumpDash";
    this.state.round = 1;
    this.state.roundCount = 1;
    this.syncPlayers();
    this.state.phase = "matchmaking";
    this.phaseTimer = MATCHMAKING_MIN + Math.random() * (MATCHMAKING_MAX - MATCHMAKING_MIN);
    this.state.timer = Math.ceil(this.phaseTimer);
    this.state.alive = this.sim.players.size;
  }

  setLocalInput(intent: InputIntent): void {
    this.localInput = intent;
  }

  sendEmote(id: number): void {
    if (id >= 0 && id < EMOTES.length) this.showEmote(this.localId, id);
  }

  dispose(): void {
    this.sim.players.clear();
    this.sim.balls.length = 0;
  }

  /** Advance by real time, stepped at a fixed 1/30s. */
  step(dt: number): void {
    this.acc += Math.min(dt, 0.1);
    while (this.acc >= STEP) {
      this.tick(STEP);
      this.acc -= STEP;
    }
  }

  // --- main loop -----------------------------------------------------------

  private tick(dt: number): void {
    this.updateEmotes(dt);
    this.maybeBotEmote(dt);

    switch (this.state.phase as Phase) {
      case "matchmaking":
        this.phaseTimer -= dt;
        this.state.timer = Math.max(0, Math.ceil(this.phaseTimer));
        this.syncPlayers();
        if (this.phaseTimer <= 0) {
          this.state.phase = "countdown";
          this.phaseTimer = COUNTDOWN;
        }
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
        break;
    }
  }

  private updatePlaying(dt: number): void {
    const slide = this.localInput.moveX * slideSign(this.localSide);
    this.sim.setInput(this.localId, slide, this.localInput.jump || this.localInput.action);
    this.sim.step(dt);
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

  private endMatch(): void {
    this.state.phase = "ended";
    this.phaseTimer = END_SCREEN;
    const ranked = this.sim.ranking();
    ranked.forEach((id, rank) => {
      const p = this.state.players.get(id);
      if (!p) return;
      p.placement = rank + 1;
      p.anim = rank === 0 ? "win" : "lose";
    });
    const winnerId = this.sim.winnerId ?? ranked[0];
    if (winnerId) {
      const w = this.state.players.get(winnerId);
      if (w) {
        this.state.winnerId = winnerId;
        this.state.winnerName = w.name;
      }
    }
    this.clearEntities();
    this.state.alive = [...this.sim.players.values()].filter((p) => p.alive).length;

    if (!this.recorded) {
      this.recorded = true;
      const me = this.state.players.get(this.localId);
      if (me) recordLocalResult(me.name, this.opts.wallet, me.points, me.placement);
    }
  }

  // --- spawning ------------------------------------------------------------

  private addLocal(): number {
    const side = this.sim.addPlayer(this.localId, false);
    const p = new PlayerState();
    p.name = this.opts.name || "You";
    p.wallet = this.opts.wallet ?? "";
    p.character = isValidCharacter(this.opts.character) ? this.opts.character : "knight";
    p.colorIndex = this.colorCounter++;
    p.side = side;
    p.points = START_POINTS;
    this.state.players.set(this.localId, p);
    return side;
  }

  private addBot(): void {
    const id = `bot-${++this.botCounter}`;
    const side = this.sim.addPlayer(id, true);
    const p = new PlayerState();
    p.name = pickBotName(this.takenNames());
    p.isBot = true;
    p.wallet = randomWallet();
    p.character = CHARACTER_IDS[this.botCounter % CHARACTER_IDS.length]!;
    p.colorIndex = this.colorCounter++;
    p.side = side;
    p.points = START_POINTS;
    this.state.players.set(id, p);
  }

  private takenNames(): Set<string> {
    const taken = new Set<string>();
    this.state.players.forEach((p) => taken.add(p.name));
    return taken;
  }

  // --- emotes / helpers ----------------------------------------------------

  private showEmote(id: string, emoteId: number): void {
    const player = this.state.players.get(id);
    if (!player) return;
    player.emote = EMOTES[emoteId]!;
    this.emoteTimers.set(id, 2.5);
  }

  private maybeBotEmote(dt: number): void {
    if (this.state.phase !== "playing" && this.state.phase !== "matchmaking") return;
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
}
