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
import { MatchState, PlayerState } from "./schema";

/**
 * Authoritative match room. Runs one Rapier world at a fixed tick, applies each
 * client's latest input, and broadcasts the resulting transforms via schema
 * state. Clients can only send input intents (see messages.ts), so they cannot
 * teleport or report results.
 *
 * Phase 3 keeps the match in a single continuous "playing" phase with bumper
 * knockback and fall-respawn. Phase 4 layers rounds, bots, and elimination on
 * top of this loop.
 */
export class MatchRoom extends Room<MatchState> {
  override maxClients = MAX_PLAYERS;

  private physics!: PhysicsWorld;
  private readonly sims = new Map<string, PlayerSim>();
  private spawnCounter = 0;

  override async onCreate(): Promise<void> {
    this.state = new MatchState();
    this.state.phase = "playing";

    this.physics = await PhysicsWorld.create(PHYS.gravity, 1 / TICK_RATE);
    this.buildArena();

    this.onMessage(INPUT_MESSAGE, (client, message: InputIntent) => {
      const sim = this.sims.get(client.sessionId);
      if (sim) sim.setInput(sanitizeInput(message));
    });

    this.setSimulationInterval((deltaMs) => this.update(deltaMs), 1000 / TICK_RATE);
  }

  override onJoin(client: Client, options?: JoinOptions): void {
    const spawn = spawnPoint(this.spawnCounter++, MAX_PLAYERS);
    const sim = new PlayerSim(this.physics, spawn);
    this.sims.set(client.sessionId, sim);

    const player = new PlayerState();
    player.name = sanitizeName(options?.name) ?? `Player-${this.spawnCounter}`;
    player.wallet = typeof options?.wallet === "string" ? options.wallet.slice(0, 64) : "";
    player.x = spawn.x;
    player.y = spawn.y;
    player.z = spawn.z;
    this.state.players.set(client.sessionId, player);

    console.log(`[match ${this.roomId}] join ${client.sessionId} (${player.name})`);
  }

  override onLeave(client: Client): void {
    const sim = this.sims.get(client.sessionId);
    if (sim) {
      sim.destroy();
      this.sims.delete(client.sessionId);
    }
    this.state.players.delete(client.sessionId);
    console.log(`[match ${this.roomId}] leave ${client.sessionId}`);
  }

  override onDispose(): void {
    this.physics?.dispose();
  }

  private update(deltaMs: number): void {
    const dt = deltaMs / 1000;

    for (const sim of this.sims.values()) sim.preStep(dt);
    this.physics.step();

    for (const [id, sim] of this.sims) {
      sim.postStep();
      this.resolveBumpers(sim);
      if (sim.fellOff) sim.respawn();

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

  private resolveBumpers(sim: PlayerSim): void {
    if (sim.bumperCooldown > 0) return;
    const p = sim.position;
    for (const b of ARENA.bumpers) {
      const dx = p.x - b.x;
      const dz = p.z - b.z;
      const dist = Math.hypot(dx, dz);
      if (dist <= b.radius + PHYS.capsuleRadius + PHYS.bumperTriggerPad) {
        const inv = dist > 1e-4 ? 1 / dist : 0;
        const nx = inv === 0 ? 1 : dx * inv;
        const nz = inv === 0 ? 0 : dz * inv;
        sim.applyKnockback(nx, nz, PHYS.knockStrength);
        return;
      }
    }
  }

  private buildArena(): void {
    const world = this.physics.world;
    // Platform slab (top surface at y = 0).
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(
        ARENA.platformHalf,
        ARENA.platformThickness / 2,
        ARENA.platformHalf,
      ).setTranslation(0, -ARENA.platformThickness / 2, 0),
    );
    // Bumper colliders.
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
