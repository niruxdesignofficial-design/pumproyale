import type { InputIntent } from "@party-royale/shared";
import type { PhysicsWorld } from "../physics/PhysicsWorld";
import type { PlayerSim } from "../physics/PlayerSim";
import type { BotPlan } from "../match/IMinigame";

/** Global difficulty knobs for bots. */
const BOT_SKILL = {
  /** Lower = better aim/steering (wander amplitude). */
  wander: 0.5,
  /** How far ahead (m) to probe for a gap/edge before jumping. */
  look: 1.6,
  /** Min seconds between voluntary jumps. */
  jumpCooldown: 0.45,
} as const;

/**
 * Smart bot movement. The current minigame supplies a high-level `BotPlan`
 * (where to go, whether to act/jump); this turns it into an input intent with:
 *  - steering toward the target with a little per-bot wander (skill-scaled),
 *  - gap/edge handling: jump a gap only when there is a safe landing across,
 *    back off from a bottomless cliff,
 *  - step-up / stuck handling: jump when blocked while trying to move,
 *  - respects an explicit plan.jump / plan.hold.
 */
export class BotController {
  /** Per-bot skill in [0.55, 1]; higher = steadier and more accurate. */
  readonly skill = 0.55 + Math.random() * 0.45;

  private phase = Math.random() * Math.PI * 2;
  private lastX = 0;
  private lastZ = 0;
  private inited = false;
  private stuck = 0;
  private jumpCd = 0;

  think(
    sim: PlayerSim,
    plan: BotPlan,
    physics: PhysicsWorld,
    dt: number,
    seq: number,
  ): InputIntent {
    const p = sim.position;
    if (!this.inited) {
      this.lastX = p.x;
      this.lastZ = p.z;
      this.inited = true;
    }

    const dx = plan.tx - p.x;
    const dz = plan.tz - p.z;
    const dist = Math.hypot(dx, dz);
    let nx = dist > 0.1 ? dx / dist : 0;
    let nz = dist > 0.1 ? dz / dist : 0;
    if (plan.hold) {
      nx = 0;
      nz = 0;
    }

    // Gentle wander so bots do not move like rails (smaller for higher skill).
    this.phase += dt * 1.7;
    const wander = BOT_SKILL.wander * (1.1 - this.skill);
    nx += Math.cos(this.phase) * wander;
    nz += Math.sin(this.phase * 1.3) * wander;

    const moved = Math.hypot(p.x - this.lastX, p.z - this.lastZ);
    this.lastX = p.x;
    this.lastZ = p.z;

    if (this.jumpCd > 0) this.jumpCd -= dt;
    let jump = false;

    if (plan.jump) {
      jump = true;
    } else if (sim.isGrounded && this.jumpCd <= 0 && !plan.hold && (nx !== 0 || nz !== 0)) {
      // Probe for ground a step ahead (origin raised so step-ups still read as ground).
      const ahead = physics.groundBelow(p.x + nx * BOT_SKILL.look, p.y + 2.0, p.z + nz * BOT_SKILL.look, 3.5);
      if (ahead === null) {
        // Gap ahead: jump only if a landing exists a bit further on.
        const landing = physics.groundBelow(p.x + nx * 3.2, p.y + 2.0, p.z + nz * 3.2, 4.0);
        if (landing !== null && dist > 1.0) {
          jump = true;
        } else {
          // Bottomless cliff with no landing: ease off the edge.
          nx *= -0.2;
          nz *= -0.2;
        }
      }
      // Blocked while trying to move (a step-up or a wall): jump to climb it.
      if (!jump) {
        if (sim.planarSpeed < 1.0 && moved < 0.04) this.stuck += dt;
        else this.stuck = Math.max(0, this.stuck - dt * 1.5);
        if (this.stuck > 0.22) {
          jump = true;
          this.stuck = 0;
        }
      }
    }
    if (jump) this.jumpCd = BOT_SKILL.jumpCooldown;

    const ml = Math.hypot(nx, nz);
    if (ml > 1) {
      nx /= ml;
      nz /= ml;
    }

    return {
      moveX: nx,
      moveZ: nz,
      run: true,
      jump,
      dive: false,
      action: Boolean(plan.action),
      seq,
    };
  }
}
