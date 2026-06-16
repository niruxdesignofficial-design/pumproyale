import RAPIER from "@dimforge/rapier3d-compat";

/**
 * Server-side Rapier world wrapper. The server is authoritative: it owns the one
 * true physics simulation for a match. The room steps this once per tick.
 */
export class PhysicsWorld {
  readonly world: RAPIER.World;

  private constructor(gravityY: number) {
    this.world = new RAPIER.World({ x: 0, y: -gravityY, z: 0 });
  }

  static async create(gravityY: number, timestep: number): Promise<PhysicsWorld> {
    await RAPIER.init();
    const pw = new PhysicsWorld(gravityY);
    pw.world.timestep = timestep;
    return pw;
  }

  step(): void {
    this.world.step();
  }

  /** True if a downward ray from origin hits a collider within maxToi, ignoring `exclude`. */
  groundCheck(origin: RAPIER.Vector, maxToi: number, exclude: RAPIER.Collider): boolean {
    const ray = new RAPIER.Ray(origin, { x: 0, y: -1, z: 0 });
    return this.world.castRay(ray, maxToi, true, undefined, undefined, exclude) !== null;
  }

  dispose(): void {
    this.world.free();
  }
}
