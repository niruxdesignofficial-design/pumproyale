// Constants shared between client and server.
// Most are consumed from Phase 3 onward; they are declared now so the contract
// is single-sourced and later phases do not introduce magic numbers.

/** Authoritative simulation tick rate (Hz) for the server (Phase 3+). */
export const TICK_RATE = 30;

/** Fixed timestep in seconds derived from TICK_RATE. */
export const FIXED_DT = 1 / TICK_RATE;

/** Maximum players per match. Exactly one winner per match. */
export const MAX_PLAYERS = 4;

/** Default Colyseus game server port (Phase 3+). */
export const DEFAULT_SERVER_PORT = 2567;

/** Default REST API port (Phase 7+). */
export const DEFAULT_API_PORT = 3001;
