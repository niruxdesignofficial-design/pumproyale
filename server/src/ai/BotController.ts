import type { InputIntent } from "@party-royale/shared";
import type { PlayerSim } from "../physics/PlayerSim";

/**
 * Simple bot AI. Heads toward a target point (supplied by the current minigame),
 * with a little orbiting jitter so bots do not perfectly stack, and the
 * occasional jump. Good enough to fill empty slots and make matches resolve.
 */
export class BotController {
  private phase = Math.random() * Math.PI * 2;
  private jumpTimer = 0.6 + Math.random() * 1.4;

  think(
    sim: PlayerSim,
    target: { x: number; z: number },
    dt: number,
    seq: number,
    action = false,
  ): InputIntent {
    const p = sim.position;
    let tx = target.x - p.x;
    let tz = target.z - p.z;
    const len = Math.hypot(tx, tz) || 1;
    tx /= len;
    tz /= len;

    this.phase += dt * 1.5;
    tx += Math.cos(this.phase) * 0.25;
    tz += Math.sin(this.phase) * 0.25;

    this.jumpTimer -= dt;
    let jump = false;
    if (this.jumpTimer <= 0) {
      jump = true;
      this.jumpTimer = 0.8 + Math.random() * 1.4;
    }

    return { moveX: tx, moveZ: tz, run: true, jump, dive: false, action, seq };
  }
}
