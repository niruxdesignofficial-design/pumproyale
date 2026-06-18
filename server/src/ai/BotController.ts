import type { InputIntent } from "@party-royale/shared";
import type { PhysicsWorld } from "../physics/PhysicsWorld";
import type { PlayerSim } from "../physics/PlayerSim";
import type { BotPlan } from "../match/IMinigame";

/** Global difficulty knobs for bots. */
const BOT_SKILL = {
  /** Lower = better aim/steering (wander amplitude). Kept modest so bots stay on
   * narrow parkour platforms instead of wandering off the edge. */
  wander: 0.34,
  /** How far ahead (m) to probe for the next step of ground (gap detection). */
  look: 1.2,
  /** Max horizontal gap (m) a bot will commit to jumping (within the jump arc). */
  maxJump: 5.0,
  /** Min seconds between voluntary jumps (snappy enough to hop up steps in rhythm). */
  jumpCooldown: 0.38,
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
  /** Human touches: occasional hesitation + smoothed (non-snappy) turning. */
  private pauseTimer = 0;
  private headX = 0;
  private headZ = 0;

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

    // Ease the heading toward the target (smooth, not snappy) — but quick enough
    // that bots reach full speed with runway before a step/gap, not at the wall.
    const turn = 0.32 + this.skill * 0.16;
    this.headX += (nx - this.headX) * turn;
    this.headZ += (nz - this.headZ) * turn;
    nx = this.headX;
    nz = this.headZ;

    // Human hesitation: occasional brief pauses (more for lower-skill bots).
    let paused = false;
    if (this.pauseTimer > 0) {
      this.pauseTimer -= dt;
      paused = true;
    } else if (!plan.jump && Math.random() < 0.006 * (1.4 - this.skill)) {
      this.pauseTimer = 0.18 + Math.random() * 0.35;
    }
    if (paused) {
      nx *= 0.05;
      nz *= 0.05;
    }

    const moved = Math.hypot(p.x - this.lastX, p.z - this.lastZ);
    this.lastX = p.x;
    this.lastZ = p.z;

    // Pure direction to the next waypoint (no wander) — used for gap probing and
    // for a clean, full-speed takeoff so the jump actually carries across the gap.
    const tdx = dist > 0.1 ? dx / dist : this.headX;
    const tdz = dist > 0.1 ? dz / dist : this.headZ;

    if (this.jumpCd > 0) this.jumpCd -= dt;
    let jump = false;

    if (paused) {
      // hesitating: don't jump/act this moment
    } else if (plan.jump) {
      // Commanded jump (climb hop / hazard dodge): fire only when grounded and off
      // cooldown so it auto-repeats on landing as a rhythmic hop, taking off at full
      // speed straight at the waypoint so the jump carries up/over.
      if (sim.isGrounded && this.jumpCd <= 0) {
        jump = true;
        nx = tdx;
        nz = tdz;
      }
    } else if (sim.isGrounded && this.jumpCd <= 0 && !plan.hold && dist > 1.0) {
      // Ground-probe toward the waypoint: a gap is the ABSENCE of floor ahead; a
      // step-up is floor ahead that's HIGHER than here. Both need a jump, taken off
      // ~look metres BEFORE the edge/step so forward momentum carries up and over.
      const originY = p.y + 2.0;
      const hereToi = physics.groundBelow(p.x, originY, p.z, 4.0);
      const aheadToi = physics.groundBelow(
        p.x + tdx * BOT_SKILL.look,
        originY,
        p.z + tdz * BOT_SKILL.look,
        5.0,
      );
      if (aheadToi === null) {
        // Gap toward the waypoint: scan for the nearest landing within jump range.
        let landing = 0;
        for (let d = 2.0; d <= BOT_SKILL.maxJump; d += 0.5) {
          if (physics.groundBelow(p.x + tdx * d, originY, p.z + tdz * d, 5.5) !== null) {
            landing = d;
            break;
          }
        }
        if (landing > 0) {
          jump = true;
          nx = tdx;
          nz = tdz;
          this.stuck = 0;
        } else {
          // No reachable ground ahead (dead end) — ease back so we never walk off.
          nx = -tdx * 0.25;
          nz = -tdz * 0.25;
        }
      } else if (hereToi !== null && hereToi - aheadToi > 0.5) {
        // Step-up ahead (ground ~0.5m+ higher): jump now, full speed at the step.
        jump = true;
        nx = tdx;
        nz = tdz;
        this.stuck = 0;
      } else {
        // Blocked against a wall while moving (no height info): hop to climb it.
        if (sim.planarSpeed < 1.0 && moved < 0.04) this.stuck += dt;
        else this.stuck = Math.max(0, this.stuck - dt * 1.5);
        if (this.stuck > 0.2) {
          jump = true;
          nx = tdx;
          nz = tdz;
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
      action: !paused && Boolean(plan.action),
      seq,
    };
  }
}
