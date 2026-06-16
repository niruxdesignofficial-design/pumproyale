/**
 * Keyboard input map. Phase 1 stub: it tracks key state but nothing consumes it
 * yet. Phase 2 wires this into the capsule character controller (move/run/jump/
 * dive) and Phase 3 forwards sampled intents to the authoritative server.
 */
export type GameAction = "forward" | "back" | "left" | "right" | "jump" | "dive" | "run";

const DEFAULT_BINDINGS: Record<string, GameAction> = {
  KeyW: "forward",
  ArrowUp: "forward",
  KeyS: "back",
  ArrowDown: "back",
  KeyA: "left",
  ArrowLeft: "left",
  KeyD: "right",
  ArrowRight: "right",
  Space: "jump",
  ShiftLeft: "run",
  ControlLeft: "dive",
};

export class Input {
  private readonly active = new Set<GameAction>();

  attach(target: Window = window): void {
    target.addEventListener("keydown", this.onKeyDown);
    target.addEventListener("keyup", this.onKeyUp);
  }

  detach(target: Window = window): void {
    target.removeEventListener("keydown", this.onKeyDown);
    target.removeEventListener("keyup", this.onKeyUp);
  }

  isActive(action: GameAction): boolean {
    return this.active.has(action);
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    const action = DEFAULT_BINDINGS[e.code];
    if (action) this.active.add(action);
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    const action = DEFAULT_BINDINGS[e.code];
    if (action) this.active.delete(action);
  };
}
