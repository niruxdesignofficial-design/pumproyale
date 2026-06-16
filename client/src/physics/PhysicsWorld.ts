import RAPIER from "@dimforge/rapier3d-compat";

/** Downward gravity magnitude (m/s^2). Punchy, platformer-style. */
export const GRAVITY = 24;

/** Fixed physics timestep. The sandbox simulates at 60 Hz. */
export const FIXED_STEP = 1 / 60;

const MAX_SUBSTEPS = 5;

/**
 * Thin wrapper around a Rapier world with a fixed-timestep accumulator. Phase 2
 * runs this on the client for a single-player sandbox; Phase 3 moves the
 * authoritative simulation to the server using the same patterns.
 */
export class PhysicsWorld {
  readonly world: RAPIER.World;
  private accumulator = 0;

  private constructor() {
    this.world = new RAPIER.World({ x: 0, y: -GRAVITY, z: 0 });
    this.world.timestep = FIXED_STEP;
  }

  /** Rapier (compat) must initialize its WASM before a world can be created. */
  static async create(): Promise<PhysicsWorld> {
    await RAPIER.init();
    return new PhysicsWorld();
  }

  /**
   * Advance the simulation by real elapsed time, running zero or more fixed
   * substeps. `onSubstep` runs immediately before each world step so controllers
   * can apply velocities at a fixed rate.
   */
  step(dt: number, onSubstep?: () => void): void {
    this.accumulator += Math.min(dt, 0.1);
    let steps = 0;
    while (this.accumulator >= FIXED_STEP && steps < MAX_SUBSTEPS) {
      onSubstep?.();
      this.world.step();
      this.accumulator -= FIXED_STEP;
      steps += 1;
    }
  }

  /**
   * True if a ray cast straight down from `origin` hits a collider within
   * `maxToi`, ignoring `exclude` (the caster's own collider).
   */
  groundCheck(origin: RAPIER.Vector, maxToi: number, exclude: RAPIER.Collider): boolean {
    const ray = new RAPIER.Ray(origin, { x: 0, y: -1, z: 0 });
    const hit = this.world.castRay(ray, maxToi, true, undefined, undefined, exclude);
    return hit !== null;
  }

  dispose(): void {
    this.world.free();
  }
}
