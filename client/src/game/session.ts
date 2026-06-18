import type { Room } from "colyseus.js";
import type { InputIntent, JoinOptions } from "@party-royale/shared";
import type { MatchState } from "@engine/rooms/schema";
import { LocalGameManager } from "./LocalGameManager";
import { NetClient, defaultServerUrl } from "../net/NetClient";
import { getPlayMode } from "./matchMode";

/**
 * Source of authoritative match state for the renderer. The game loop reads
 * `state` (the same MatchState schema either way), pushes input, and (offline
 * only) advances the simulation. Online, the server is authoritative and `step`
 * is a no-op.
 */
export interface MatchSession {
  readonly state: MatchState;
  /** Id of the local player in `state.players` ("local" offline, sessionId online). */
  readonly localId: string;
  /** Shareable room code for private games, or null offline / for quick play. */
  readonly roomCode: string | null;
  setInput(intent: InputIntent): void;
  sendEmote(id: number): void;
  step(dt: number): void;
  dispose(): void;
}

/** Offline session: the browser runs the whole match (1 human + 3 bots). */
export class LocalSession implements MatchSession {
  readonly localId = "local";
  readonly roomCode = null;

  private constructor(private readonly mgr: LocalGameManager) {}

  static async create(options: JoinOptions): Promise<LocalSession> {
    const mgr = new LocalGameManager({
      name: options.name ?? "Player",
      character: options.character ?? "knight",
      wallet: options.wallet ?? null,
    });
    await mgr.start();
    return new LocalSession(mgr);
  }

  get state(): MatchState {
    return this.mgr.state;
  }
  setInput(intent: InputIntent): void {
    this.mgr.setLocalInput(intent);
  }
  sendEmote(id: number): void {
    this.mgr.sendEmote(id);
  }
  step(dt: number): void {
    this.mgr.step(dt);
  }
  dispose(): void {
    this.mgr.dispose();
  }
}

/** Online session: an authoritative Colyseus room shared with friends + bots. */
export class OnlineSession implements MatchSession {
  private constructor(
    private readonly net: NetClient,
    private readonly room: Room<MatchState>,
  ) {}

  static async create(options: JoinOptions): Promise<OnlineSession> {
    const net = new NetClient();
    const room = (await net.connect(defaultServerUrl(), options, getPlayMode())) as Room<MatchState>;
    await waitForInitialState(room);
    return new OnlineSession(net, room);
  }

  get state(): MatchState {
    return this.room.state;
  }
  get localId(): string {
    return this.room.sessionId;
  }
  get roomCode(): string | null {
    return this.room.roomId;
  }
  setInput(intent: InputIntent): void {
    this.net.sendInput(intent);
  }
  sendEmote(id: number): void {
    this.net.sendEmote(id);
  }
  step(): void {
    // Server-authoritative: nothing to advance locally.
  }
  dispose(): void {
    void this.net.dispose();
  }
}

/** Wait for the first decoded state so the HUD has a phase before the loop starts. */
function waitForInitialState(room: Room<MatchState>): Promise<void> {
  return new Promise((resolve) => {
    const phase = room.state?.phase;
    if (typeof phase === "string" && phase.length > 0) {
      resolve();
      return;
    }
    let done = false;
    const finish = (): void => {
      if (done) return;
      done = true;
      resolve();
    };
    room.onStateChange.once(finish);
    setTimeout(finish, 3000);
  });
}
