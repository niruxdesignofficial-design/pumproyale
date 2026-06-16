import { MAX_PLAYERS } from "@party-royale/shared";
import type { GameState } from "../game/store";

/**
 * Heads-up display. Shows a connecting overlay, an error overlay if the server
 * is unreachable, and the live match HUD (FPS, player count, controls) once
 * connected.
 */
export function Hud({ state }: { state: GameState }) {
  if (state.status === "error") {
    return (
      <div className="hud">
        <div className="hud-loading">
          <div className="hud-error-title">Connection lost</div>
          <span>{state.error || "Could not reach the game server."}</span>
          <span className="hud-dim">Start the server with `pnpm dev` and reload.</span>
        </div>
      </div>
    );
  }

  if (state.status === "connecting") {
    return (
      <div className="hud">
        <div className="hud-loading">
          <div className="hud-spinner" />
          <span>Connecting to match...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="hud">
      <div className="hud-panel hud-topleft">
        <div className="hud-title">Party Royale</div>
        <div className="hud-sub">Phase 3 - online sandbox</div>
      </div>

      <div className="hud-panel hud-topright">
        <div className="hud-stat">
          <span className="hud-label">FPS</span>
          <span className="hud-value">{state.fps}</span>
        </div>
        <div className="hud-stat">
          <span className="hud-label">Players</span>
          <span className="hud-value">
            {state.playerCount}/{MAX_PLAYERS}
          </span>
        </div>
      </div>

      {state.usingFallback && (
        <div className="hud-warn">
          Showing placeholder characters. Run <code>pnpm assets:prepare</code> to load the KayKit
          model.
        </div>
      )}

      <div className="hud-hint">
        WASD move &middot; Shift run &middot; Space jump &middot; Ctrl dive &middot; drag to orbit
      </div>
    </div>
  );
}
