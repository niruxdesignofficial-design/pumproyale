/**
 * Keyboard + mouse input map. Tracks key state; the game samples it each frame
 * and forwards intents to the authoritative server. "action" is the context
 * button (kick the ball / shoot a target), bound to E/J and the left mouse.
 */
export type GameAction = "forward" | "back" | "left" | "right" | "jump" | "dive" | "run" | "action";

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
  KeyE: "action",
  KeyJ: "action",
};

export class Input {
  private readonly active = new Set<GameAction>();
  private mouseAction = false;

  attach(target: Window = window): void {
    target.addEventListener("keydown", this.onKeyDown);
    target.addEventListener("keyup", this.onKeyUp);
    target.addEventListener("mousedown", this.onMouseDown);
    target.addEventListener("mouseup", this.onMouseUp);
  }

  detach(target: Window = window): void {
    target.removeEventListener("keydown", this.onKeyDown);
    target.removeEventListener("keyup", this.onKeyUp);
    target.removeEventListener("mousedown", this.onMouseDown);
    target.removeEventListener("mouseup", this.onMouseUp);
  }

  isActive(action: GameAction): boolean {
    if (action === "action" && this.mouseAction) return true;
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

  private readonly onMouseDown = (e: MouseEvent): void => {
    if (e.button === 0) this.mouseAction = true;
  };

  private readonly onMouseUp = (e: MouseEvent): void => {
    if (e.button === 0) this.mouseAction = false;
  };
}
