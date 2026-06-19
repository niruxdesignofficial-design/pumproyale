// Tiny observable store bridging the imperative game and the React overlay.
// Designed for React's useSyncExternalStore: getSnapshot returns a stable
// reference that only changes when state actually changes.

export type ConnectionStatus = "connecting" | "connected" | "error";

/** One player around the PumpDash arena, for the side scores + end screen. */
export interface PumpPlayer {
  readonly id: string;
  readonly name: string;
  /** Arena side guarded: 0 top, 1 bottom, 2 left, 3 right. */
  readonly side: number;
  readonly points: number;
  readonly alive: boolean;
  readonly isLocal: boolean;
  readonly isBot: boolean;
  readonly colorIndex: number;
  readonly wallet: string;
}

export interface GameState {
  readonly status: ConnectionStatus;
  readonly fps: number;
  readonly usingFallback: boolean;
  readonly error: string;
  // Match flow: "" | matchmaking | countdown | playing | ended.
  readonly matchPhase: string;
  readonly timer: number;
  readonly players: readonly PumpPlayer[];
  readonly alivePlayers: number;
  /** Which side the local player guards (-1 until known). */
  readonly youSide: number;
  /** Local dash cooldown remaining (s) and whether it is ready. */
  readonly dashCd: number;
  readonly dashReady: boolean;
  // Transient banner ("Ava eliminated"); "" when hidden.
  readonly banner: string;
  // End screen.
  readonly isLocalWinner: boolean;
  readonly winnerName: string;
  readonly localPlacement: number;
  // Room code for private games (shown in the lobby so the host can share it).
  readonly roomCode: string;
}

const INITIAL: GameState = {
  status: "connecting",
  fps: 0,
  usingFallback: false,
  error: "",
  matchPhase: "",
  timer: 0,
  players: [],
  alivePlayers: 0,
  youSide: -1,
  dashCd: 0,
  dashReady: true,
  banner: "",
  isLocalWinner: false,
  winnerName: "",
  localPlacement: 0,
  roomCode: "",
};

class GameStore {
  private state: GameState = INITIAL;
  private readonly listeners = new Set<() => void>();

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): GameState => this.state;

  set(partial: Partial<GameState>): void {
    const next = { ...this.state, ...partial };
    let changed = false;
    for (const k of Object.keys(next) as (keyof GameState)[]) {
      if (next[k] !== this.state[k]) {
        changed = true;
        break;
      }
    }
    if (!changed) return;
    this.state = next;
    for (const l of this.listeners) l();
  }

  reset(): void {
    this.state = INITIAL;
    for (const l of this.listeners) l();
  }
}

export const gameStore = new GameStore();
