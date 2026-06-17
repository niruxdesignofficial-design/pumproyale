// Tiny observable store bridging the imperative game and the React overlay.
// Designed for React's useSyncExternalStore: getSnapshot returns a stable
// reference that only changes when state actually changes.

export type ConnectionStatus = "connecting" | "connected" | "error";

/** One player's live standing, for the scoreboard. */
export interface Standing {
  readonly id: string;
  readonly name: string;
  readonly points: number;
  readonly roundScore: number;
  readonly colorIndex: number;
  readonly team: number;
  readonly isLocal: boolean;
  readonly isBot: boolean;
}

export interface GameState {
  readonly status: ConnectionStatus;
  readonly fps: number;
  readonly playerCount: number;
  readonly usingFallback: boolean;
  readonly error: string;
  // Match flow.
  readonly matchPhase: string;
  readonly round: number;
  readonly roundCount: number;
  readonly minigame: string;
  readonly timer: number;
  readonly alivePlayers: number;
  // Scoreboard (points-based; highest total wins).
  readonly standings: readonly Standing[];
  // Transient banner (e.g. "GOAL! Blue 2 - 1 Red").
  readonly banner: string;
  // Local player.
  readonly localAlive: boolean;
  readonly localPlacement: number;
  readonly isLocalWinner: boolean;
  readonly winnerName: string;
  // Room code for private games (shown in the lobby so the host can share it).
  readonly roomCode: string;
}

const INITIAL: GameState = {
  status: "connecting",
  fps: 0,
  playerCount: 0,
  usingFallback: false,
  error: "",
  matchPhase: "",
  round: 0,
  roundCount: 0,
  minigame: "",
  timer: 0,
  alivePlayers: 0,
  standings: [],
  banner: "",
  localAlive: true,
  localPlacement: 0,
  isLocalWinner: false,
  winnerName: "",
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
