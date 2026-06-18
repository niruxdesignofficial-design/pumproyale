// Cosmetic "players online" counter: a believable base that drifts smoothly over
// time (slow sine + gentle noise), so the number feels live without any backend.

const BASE = 1180;
const AMPLITUDE = 260;

/** A smoothly-drifting fake count of players currently online. */
export function onlineCount(now: number = Date.now()): number {
  const t = now / 1000;
  const slow = Math.sin(t / 47) * AMPLITUDE;
  const fast = Math.sin(t / 7.3) * 40;
  const wobble = Math.sin(t / 1.9) * 8;
  return Math.max(120, Math.round(BASE + slow + fast + wobble));
}
