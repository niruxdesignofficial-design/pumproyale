import type { CSSProperties, ReactNode } from "react";
import { MAX_PLAYERS, teamColor } from "@party-royale/shared";
import type { GameState, Standing } from "../game/store";

/** Short objective + control hint per minigame. */
function objective(minigame: string): string {
  if (/soccer|football/i.test(minigame)) return "Kick the ball into a goal — E / click";
  if (/target|range|shoot/i.test(minigame)) return "Shoot the targets — E / click";
  if (/climb|tower/i.test(minigame)) return "Jump up to the flag at the top";
  if (/gem/i.test(minigame)) return "Grab as many gems as you can";
  return "";
}

function colorHex(index: number): string {
  return `#${teamColor(index).toString(16).padStart(6, "0")}`;
}

/**
 * Heads-up display for the points-based match: connecting/error overlays, lobby
 * fill timer, countdown, the live round HUD with a scoreboard, and the end
 * screen ranking players by total points.
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

  const playing = state.matchPhase === "playing";

  return (
    <div className="hud">
      <div className="hud-panel hud-topleft">
        <div className="hud-title">Party Royale</div>
        <div className="hud-sub">
          {playing && state.minigame
            ? `Round ${state.round}/${state.roundCount}: ${state.minigame}`
            : "Highest points wins"}
        </div>
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
        {(playing || state.matchPhase === "countdown") && (
          <div className="hud-stat">
            <span className="hud-label">Time</span>
            <span className="hud-value">{state.timer}s</span>
          </div>
        )}
      </div>

      {(playing || state.matchPhase === "intro") && state.standings.length > 0 && (
        <Scoreboard standings={state.standings} showRound={playing} />
      )}

      {playing && state.minigame && (
        <div className="hud-hint" style={{ top: 14, bottom: "auto" }}>
          {objective(state.minigame)}
        </div>
      )}

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

      {state.matchPhase === "intro" && (
        <div className="hud-intro">
          <div className="hud-intro-round">
            Round {state.round}/{state.roundCount}
          </div>
          <div className="hud-intro-name">{state.minigame}</div>
          <div className="hud-intro-go">{objective(state.minigame)}</div>
        </div>
      )}

      {state.matchPhase === "ended" && (
        <Overlay>
          {state.isLocalWinner ? (
            <div className="hud-win-title">You win!</div>
          ) : (
            <div className="hud-win-title">{state.winnerName || "Nobody"} wins</div>
          )}
          <FinalStandings standings={state.standings} />
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

      {(playing || state.matchPhase === "countdown") && (
        <div className="hud-hint">
          WASD move &middot; Shift run &middot; Space jump &middot; E / click action
        </div>
      )}
    </div>
  );
}

const SCOREBOARD_STYLE: CSSProperties = {
  position: "absolute",
  top: 96,
  right: 16,
  minWidth: 184,
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

function Scoreboard({ standings, showRound }: { standings: readonly Standing[]; showRound: boolean }) {
  return (
    <div className="hud-panel" style={SCOREBOARD_STYLE}>
      <div className="hud-label">Standings</div>
      {standings.map((s) => (
        <Row key={s.id} s={s} showRound={showRound} />
      ))}
    </div>
  );
}

function Row({ s, showRound }: { s: Standing; showRound: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: s.isLocal ? 700 : 400 }}>
      <span
        style={{
          width: 12,
          height: 12,
          borderRadius: 3,
          background: colorHex(s.colorIndex),
          flex: "0 0 auto",
        }}
      />
      <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {s.name}
        {s.isLocal ? " (you)" : ""}
      </span>
      {showRound && (
        <span className="hud-dim" style={{ minWidth: 18, textAlign: "right" }}>
          +{Math.round(s.roundScore)}
        </span>
      )}
      <span className="hud-value" style={{ minWidth: 22, textAlign: "right" }}>
        {s.points}
      </span>
    </div>
  );
}

function FinalStandings({ standings }: { standings: readonly Standing[] }) {
  return (
    <div
      style={{ display: "flex", flexDirection: "column", gap: 6, margin: "12px 0", minWidth: 240 }}
    >
      {standings.map((s, i) => (
        <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="hud-value" style={{ minWidth: 22 }}>
            #{i + 1}
          </span>
          <span
            style={{ width: 12, height: 12, borderRadius: 3, background: colorHex(s.colorIndex) }}
          />
          <span style={{ flex: 1, fontWeight: s.isLocal ? 700 : 400 }}>
            {s.name}
            {s.isLocal ? " (you)" : ""}
          </span>
          <span className="hud-value">{s.points} pts</span>
        </div>
      ))}
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
