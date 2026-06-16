// Tiny observable store bridging the imperative game and the React overlay.
// Designed for React's useSyncExternalStore: getSnapshot returns a stable
// reference that only changes when state actually changes.

export type GamePhase = "loading" | "ready";

export interface GameState {
  readonly phase: GamePhase;
  readonly fps: number;
  readonly usingFallback: boolean;
  readonly characterLabel: string;
}

const INITIAL: GameState = {
  phase: "loading",
  fps: 0,
  usingFallback: false,
  characterLabel: "",
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
    // Avoid spurious notifications (e.g. identical FPS samples).
    if (
      next.phase === this.state.phase &&
      next.fps === this.state.fps &&
      next.usingFallback === this.state.usingFallback &&
      next.characterLabel === this.state.characterLabel
    ) {
      return;
    }
    this.state = next;
    for (const l of this.listeners) l();
  }

  reset(): void {
    this.state = INITIAL;
    for (const l of this.listeners) l();
  }
}

export const gameStore = new GameStore();
