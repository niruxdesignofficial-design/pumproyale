/**
 * Single requestAnimationFrame loop. Owns the frame clock and a sampled FPS
 * value so the HUD can display performance without re-rendering every frame.
 */
export class GameLoop {
  private rafId = 0;
  private running = false;
  private lastTime = 0;

  // FPS sampling.
  private frames = 0;
  private fpsAccum = 0;
  private fps = 0;

  /** @param onFrame called every frame with the delta time in seconds. */
  constructor(private readonly onFrame: (dt: number) => void) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
  }

  getFps(): number {
    return this.fps;
  }

  private readonly tick = (now: number): void => {
    if (!this.running) return;
    // Clamp dt to avoid a huge jump after a tab regains focus.
    const dt = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;

    this.frames += 1;
    this.fpsAccum += dt;
    if (this.fpsAccum >= 0.25) {
      this.fps = Math.round(this.frames / this.fpsAccum);
      this.frames = 0;
      this.fpsAccum = 0;
    }

    this.onFrame(dt);
    this.rafId = requestAnimationFrame(this.tick);
  };
}
