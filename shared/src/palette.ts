// Bright Fall-Guys "candy" palette, shared so client visuals stay consistent.

export const CANDY = {
  pink: 0xff6fae,
  blue: 0x57c1ff,
  mint: 0x5fe0b0,
  lemon: 0xffd24d,
  lavender: 0xb98cff,
  coral: 0xff8a5c,
  // Functional roles.
  danger: 0xff5a6e, // spinning bars / bumpers
  floorA: 0x86d8ff,
  floorB: 0xffc2e2,
  finish: 0x57e08a,
} as const;

/** Per-player team colors (picked by join order / hash). */
export const TEAM_COLORS = [0xff6fae, 0x57c1ff, 0x5fe0b0, 0xffd24d, 0xb98cff, 0xff8a5c];

export function teamColor(index: number): number {
  return TEAM_COLORS[index % TEAM_COLORS.length]!;
}
