// Constants shared between client and server.
// Most are consumed from Phase 3 onward; they are declared now so the contract
// is single-sourced and later phases do not introduce magic numbers.

/** Authoritative simulation tick rate (Hz) for the server (Phase 3+). */
export const TICK_RATE = 30;

/** Fixed timestep in seconds derived from TICK_RATE. */
export const FIXED_DT = 1 / TICK_RATE;

/** Maximum players per match. Exactly one winner per match. */
export const MAX_PLAYERS = 4;

/**
 * Points awarded by finishing rank within a single minigame round (1st..4th).
 * Everyone plays every minigame; the match winner is whoever has the most points
 * summed across all rounds. There is no elimination.
 */
export const PLACE_POINTS = [10, 6, 3, 1] as const;

/** Default Colyseus game server port (Phase 3+). */
export const DEFAULT_SERVER_PORT = 2567;

/** Default REST API port (Phase 7+). */
export const DEFAULT_API_PORT = 3001;
