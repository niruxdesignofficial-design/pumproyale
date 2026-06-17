import type { ReactNode } from "react";
import { MAX_PLAYERS } from "@party-royale/shared";
import type { GameState } from "../game/store";

/**
 * Heads-up display covering the whole match flow: connecting/error overlays, the
 * lobby fill timer, the countdown, the live round HUD, and the end screen.
 */
export function Hud({ state, onExit }: { state: GameState; onExit: () => void }) {
  if (state.status === "error") {
    return (
      <Overlay>
        <div className="hud-error-title">
          {state.winnerName ? "Match over" : "Connection lost"}
        </div>
        <span>{state.error || "Could not reach the game server."}</span>
        <button className="hud-button" onClick={onExit}>
          Back to menu
        </button>
        <span className="hud-dim">Make sure the server is running (`pnpm dev`).</span>
      </Overlay>
    );
  }

  if (state.status === "connecting") {
    return (
      <Overlay>
        <div className="hud-spinner" />
        <span>Connecting to match...</span>
      </Overlay>
    );
  }

  return (
    <div className="hud">
      <div className="hud-panel hud-topleft">
        <div className="hud-title">Party Royale</div>
        <div className="hud-sub">
          {state.matchPhase === "playing" && state.minigame
            ? `Round ${state.round}: ${state.minigame}`
            : "Party Royale"}
        </div>
      </div>

      <div className="hud-panel hud-topright">
        <div className="hud-stat">
          <span className="hud-label">FPS</span>
          <span className="hud-value">{state.fps}</span>
        </div>
        <div className="hud-stat">
          <span className="hud-label">{state.matchPhase === "playing" ? "Alive" : "Players"}</span>
          <span className="hud-value">
            {state.matchPhase === "playing" ? state.alivePlayers : state.playerCount}/{MAX_PLAYERS}
          </span>
        </div>
        {(state.matchPhase === "playing" || state.matchPhase === "countdown") && (
          <div className="hud-stat">
            <span className="hud-label">Time</span>
            <span className="hud-value">{state.timer}s</span>
          </div>
        )}
      </div>

      {state.matchPhase === "waiting" && (
        <Overlay>
          <div className="hud-spinner" />
          <span>Waiting for players...</span>
          <span className="hud-dim">
            {state.playerCount}/{MAX_PLAYERS} joined &middot; filling with bots in {state.timer}s
          </span>
        </Overlay>
      )}

      {state.matchPhase === "countdown" && (
        <div className="hud-center-big">{state.timer > 0 ? state.timer : "Go!"}</div>
      )}

      {state.matchPhase === "playing" && !state.localAlive && (
        <div className="hud-warn">
          Eliminated{state.localPlacement > 0 ? ` - placed #${state.localPlacement}` : ""}.
          Spectating...
        </div>
      )}

      {state.matchPhase === "ended" && (
        <Overlay>
          {state.isLocalWinner ? (
            <div className="hud-win-title">You win!</div>
          ) : (
            <>
              <div className="hud-win-title">{state.winnerName || "Nobody"} wins</div>
              {state.localPlacement > 0 && (
                <span className="hud-dim">You placed #{state.localPlacement}</span>
              )}
            </>
          )}
          <button className="hud-button" onClick={onExit}>
            Back to menu
          </button>
        </Overlay>
      )}

      {state.usingFallback && (
        <div className="hud-warn hud-warn-bottom">
          Placeholder characters. Run <code>pnpm assets:prepare</code> for the KayKit model.
        </div>
      )}

      {(state.matchPhase === "playing" || state.matchPhase === "countdown") && (
        <div className="hud-hint">
          WASD move &middot; Shift run &middot; Space jump &middot; Ctrl dive &middot; drag to orbit
        </div>
      )}
    </div>
  );
}

function Overlay({ children }: { children: ReactNode }) {
  return (
    <div className="hud">
      <div className="hud-loading">{children}</div>
    </div>
  );
}
