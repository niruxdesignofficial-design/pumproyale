import { Room, type Client } from "@colyseus/core";
import RAPIER from "@dimforge/rapier3d-compat";
import {
  ARENA,
  INPUT_MESSAGE,
  MAX_PLAYERS,
  PHYS,
  TICK_RATE,
  spawnPoint,
  type InputIntent,
  type JoinOptions,
} from "@party-royale/shared";
import { PhysicsWorld } from "../physics/PhysicsWorld";
import { PlayerSim } from "../physics/PlayerSim";
import { BotController } from "../ai/BotController";
import { createMinigame } from "../match/MinigameRegistry";
import type { IMinigame, MinigameContext } from "../match/IMinigame";
import { MatchState, PlayerState } from "./schema";

/** Lobby fill window once the first human joins (seconds). */
const FILL_WAIT = 8;
const COUNTDOWN = 4;
const END_SCREEN = 12;
const MIN_HUMANS = 1;

type Phase = "waiting" | "countdown" | "playing" | "ended";

/**
 * Authoritative match room with the full Phase 4 flow:
 * waiting (lobby) -> fill empty slots with bots -> countdown -> one or more
 * minigame rounds (eliminating players) -> ended (exactly one winner).
 *
 * All scoring, elimination, round transitions, and the winner are decided here.
 * Clients only send input intents.
 */
export class MatchRoom extends Room<MatchState> {
  override maxClients = MAX_PLAYERS;

  private physics!: PhysicsWorld;
  private readonly sims = new Map<string, PlayerSim>();
  private readonly bots = new Map<string, BotController>();
  private ctx!: MinigameContext;

  private spawnCounter = 0;
  private botCounter = 0;
  private botSeq = 0;

  private fillTimer = FILL_WAIT;
  private phaseTimer = 0;
  private roundIndex = 0;
  private roundElapsed = 0;
  private minigame: IMinigame | null = null;

  override async onCreate(): Promise<void> {
    this.state = new MatchState();
    this.state.phase = "waiting";

    this.physics = await PhysicsWorld.create(PHYS.gravity, 1 / TICK_RATE);
    this.buildArena();

    this.ctx = {
      physics: this.physics,
      state: this.state,
      sims: this.sims,
      aliveIds: () => [...this.sims.keys()],
      eliminate: (id, reason) => this.eliminate(id, reason),
      botTarget: (id) => this.minigame?.botTarget?.(id, this.ctx) ?? { x: 0, z: 0 },
    };

    this.onMessage(INPUT_MESSAGE, (client, message: InputIntent) => {
      if (this.state.phase === "ended") return;
      this.sims.get(client.sessionId)?.setInput(sanitizeInput(message));
    });

    this.setSimulationInterval((deltaMs) => this.update(deltaMs), 1000 / TICK_RATE);
  }

  override onJoin(client: Client, options?: JoinOptions): void {
    const spawn = spawnPoint(this.spawnCounter++, MAX_PLAYERS);
    this.sims.set(client.sessionId, new PlayerSim(this.physics, spawn));

    const player = new PlayerState();
    player.name = sanitizeName(options?.name) ?? `Player-${this.spawnCounter}`;
    player.wallet = typeof options?.wallet === "string" ? options.wallet.slice(0, 64) : "";
    player.x = spawn.x;
    player.y = spawn.y;
    player.z = spawn.z;
    this.state.players.set(client.sessionId, player);
    this.state.alive = this.sims.size;

    console.log(`[match ${this.roomId}] join ${client.sessionId} (${player.name})`);
  }

  override onLeave(client: Client): void {
    if (this.state.phase === "playing" && this.sims.has(client.sessionId)) {
      this.eliminate(client.sessionId, "left");
    } else {
      this.removeSim(client.sessionId);
      this.state.players.delete(client.sessionId);
    }
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
    const allowRespawn = this.state.phase === "waiting" || this.state.phase === "countdown";

    for (const [id, sim] of this.sims) {
      const ai = this.bots.get(id);
      if (ai) sim.setInput(ai.think(sim, this.ctx.botTarget(id), dt, this.botSeq++));
      sim.preStep(dt);
    }

    this.physics.step();

    for (const [id, sim] of this.sims) {
      sim.postStep();
      this.resolveBumpers(sim);
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
      this.state.phase = "playing";
      this.roundIndex = 0;
      this.startRound();
    }
  }

  private updatePlaying(dt: number): void {
    if (!this.minigame) return;
    this.roundElapsed += dt;
    this.minigame.update(this.ctx, dt);
    this.state.alive = this.sims.size;
    this.state.timer = Math.max(0, Math.ceil(this.minigame.maxDuration - this.roundElapsed));

    if (this.minigame.isComplete(this.ctx)) {
      if (this.sims.size <= 1) this.endMatch();
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
    while (this.sims.size < MAX_PLAYERS) this.addBot();
    this.state.phase = "countdown";
    this.phaseTimer = COUNTDOWN;
    this.state.alive = this.sims.size;
    console.log(`[match ${this.roomId}] starting with ${this.sims.size} players`);
  }

  private startRound(): void {
    this.minigame?.teardown(this.ctx);
    this.minigame = createMinigame(this.roundIndex);
    this.roundElapsed = 0;
    this.state.round = this.roundIndex + 1;
    this.minigame.setup(this.ctx);
    console.log(`[match ${this.roomId}] round ${this.state.round}: ${this.minigame.name}`);
  }

  private nextRound(): void {
    this.roundIndex += 1;
    this.startRound();
  }

  private endMatch(): void {
    this.minigame?.teardown(this.ctx);
    this.minigame = null;
    this.state.phase = "ended";
    this.phaseTimer = END_SCREEN;

    const winnerId = this.sims.keys().next().value as string | undefined;
    if (winnerId) {
      const winner = this.state.players.get(winnerId);
      if (winner) {
        winner.alive = true;
        winner.placement = 1;
        winner.anim = "win";
        this.state.winnerId = winnerId;
        this.state.winnerName = winner.name;
      }
    }
    this.state.alive = this.sims.size;
    console.log(`[match ${this.roomId}] winner: ${this.state.winnerName || "(none)"}`);
  }

  // --- helpers -------------------------------------------------------------

  private addBot(): void {
    const id = `bot-${++this.botCounter}`;
    const spawn = spawnPoint(this.spawnCounter++, MAX_PLAYERS);
    this.sims.set(id, new PlayerSim(this.physics, spawn));
    this.bots.set(id, new BotController());

    const player = new PlayerState();
    player.name = `Bot-${this.botCounter}`;
    player.isBot = true;
    player.x = spawn.x;
    player.y = spawn.y;
    player.z = spawn.z;
    this.state.players.set(id, player);
  }

  private eliminate(id: string, reason: string): void {
    const sim = this.sims.get(id);
    if (!sim) return;
    const before = this.sims.size;
    const player = this.state.players.get(id);
    if (player) {
      player.alive = false;
      player.placement = before;
      player.anim = "lose";
    }
    this.removeSim(id);
    this.state.alive = this.sims.size;
    console.log(`[match ${this.roomId}] eliminate ${id} (${reason}) -> placement ${before}`);
  }

  private removeSim(id: string): void {
    this.sims.get(id)?.destroy();
    this.sims.delete(id);
    this.bots.delete(id);
  }

  private resolveBumpers(sim: PlayerSim): void {
    if (sim.bumperCooldown > 0) return;
    const p = sim.position;
    for (const b of ARENA.bumpers) {
      const dx = p.x - b.x;
      const dz = p.z - b.z;
      const dist = Math.hypot(dx, dz);
      if (dist <= b.radius + PHYS.capsuleRadius + PHYS.bumperTriggerPad) {
        const inv = dist > 1e-4 ? 1 / dist : 0;
        sim.applyKnockback(inv === 0 ? 1 : dx * inv, inv === 0 ? 0 : dz * inv, PHYS.knockStrength);
        return;
      }
    }
  }

  private buildArena(): void {
    const world = this.physics.world;
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(
        ARENA.platformHalf,
        ARENA.platformThickness / 2,
        ARENA.platformHalf,
      ).setTranslation(0, -ARENA.platformThickness / 2, 0),
    );
    const bumperHeight = 1.4;
    for (const b of ARENA.bumpers) {
      world.createCollider(
        RAPIER.ColliderDesc.cylinder(bumperHeight / 2, b.radius)
          .setTranslation(b.x, bumperHeight / 2, b.z)
          .setRestitution(0.3),
      );
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
    seq: typeof msg?.seq === "number" && Number.isFinite(msg.seq) ? msg.seq : 0,
  };
}

function sanitizeName(name?: string): string | undefined {
  if (typeof name !== "string") return undefined;
  const trimmed = name.trim().slice(0, 16);
  return trimmed.length > 0 ? trimmed : undefined;
}
