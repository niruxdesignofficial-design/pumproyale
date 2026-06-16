// Tiny observable store bridging the imperative game and the React overlay.
// Designed for React's useSyncExternalStore: getSnapshot returns a stable
// reference that only changes when state actually changes.

export type ConnectionStatus = "connecting" | "connected" | "error";

export interface GameState {
  readonly status: ConnectionStatus;
  readonly fps: number;
  readonly playerCount: number;
  readonly usingFallback: boolean;
  readonly error: string;
  // Match flow (populated from Phase 4 onward).
  readonly matchPhase: string;
  readonly round: number;
  readonly minigame: string;
  readonly timer: number;
  readonly alive: boolean;
  readonly winnerName: string;
}

const INITIAL: GameState = {
  status: "connecting",
  fps: 0,
  playerCount: 0,
  usingFallback: false,
  error: "",
  matchPhase: "",
  round: 0,
  minigame: "",
  timer: 0,
  alive: true,
  winnerName: "",
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
