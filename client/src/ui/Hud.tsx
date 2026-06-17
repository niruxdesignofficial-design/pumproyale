import { useState, type ReactNode } from "react";
import { MAX_PLAYERS, teamColor } from "@party-royale/shared";
import type { GameState, Standing } from "../game/store";
import { sound } from "../core/Sound";
import { LobbyPanel } from "./LobbyPanel";
import { Confetti } from "./Confetti";

const MEDALS = ["/assets/medals/gold.png", "/assets/medals/silver.png", "/assets/medals/bronze.png"];

/** Short objective + control hint per minigame. */
function objective(minigame: string): string {
  if (/soccer|football/i.test(minigame)) return "Score in the enemy team's goal — E / click to kick";
  if (/target|range|shoot/i.test(minigame)) return "Shoot the targets across the barrier — E / click";
  if (/climb|tower/i.test(minigame)) return "Climb to the flag — dodge the bars and rolling balls";
  if (/gem/i.test(minigame)) return "Grab gems — the floor is falling!";
  return "";
}

function colorHex(index: number): string {
  return `#${teamColor(index).toString(16).padStart(6, "0")}`;
}

/** A player's swatch color: team color during team rounds, else candy color. */
function dotColor(s: Standing): string {
  if (s.team === 0) return "#4aa3ff";
  if (s.team === 1) return "#ff5a5a";
  return colorHex(s.colorIndex);
}

/**
 * Heads-up display for the points match: connecting/error overlays, the lobby,
 * countdown, the live round HUD (prominent timer, goal banner, scoreboard), and
 * the end screen with medals.
 */
export function Hud({ state, onExit }: { state: GameState; onExit: () => void }) {
  if (state.status === "error") {
    return (
      <Overlay>
        <div className="hud-error-title">{state.winnerName ? "Match over" : "Connection lost"}</div>
        <span>{state.error || "Could not reach the game server."}</span>
        <button className="hud-button" onClick={() => exit(onExit)}>
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
  const isSoccer = /soccer|football/i.test(state.minigame);
  const blueGoals = state.standings.find((s) => s.team === 0)?.roundScore ?? 0;
  const redGoals = state.standings.find((s) => s.team === 1)?.roundScore ?? 0;

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
        <MuteButton />
      </div>

      {playing && (
        <div className={`hud-clock${state.timer <= 5 ? " low" : ""}`}>{state.timer}</div>
      )}

      {(playing || state.matchPhase === "intro") && state.standings.length > 0 && (
        <Scoreboard standings={state.standings} showRound={playing} />
      )}

      {playing && state.banner && <div className="hud-banner">{state.banner}</div>}

      {playing && isSoccer && (
        <div className="hud-soccer">
          <span style={{ color: "#4aa3ff" }}>Blue {Math.round(blueGoals)}</span>
          <span style={{ opacity: 0.6 }}> &ndash; </span>
          <span style={{ color: "#ff5a5a" }}>{Math.round(redGoals)} Red</span>
        </div>
      )}

      {playing && state.minigame && !isSoccer && (
        <div className="hud-hint" style={{ top: 64, bottom: "auto" }}>
          {objective(state.minigame)}
        </div>
      )}

      {state.matchPhase === "waiting" && <LobbyPanel state={state} />}

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
          <Confetti />
          {state.isLocalWinner ? (
            <div className="hud-win-title">You win!</div>
          ) : (
            <div className="hud-win-title">{state.winnerName || "Nobody"} wins</div>
          )}
          <MedalStandings standings={state.standings} />
          <button className="hud-button" onClick={() => exit(onExit)}>
            Back to menu
          </button>
        </Overlay>
      )}

      {state.usingFallback && (
        <div className="hud-warn hud-warn-bottom">
          Placeholder characters. Run <code>pnpm assets:prepare</code> for the KayKit model.
        </div>
      )}

      {(playing || state.matchPhase === "countdown" || state.matchPhase === "waiting") && (
        <div className="hud-hint">
          WASD move &middot; Shift run &middot; Space jump &middot; E / click action &middot; 1-4 emote
        </div>
      )}
    </div>
  );
}

function MuteButton() {
  const [muted, setMuted] = useState(sound.isMuted());
  return (
    <button
      className="hud-mute"
      title={muted ? "Unmute" : "Mute"}
      onClick={() => setMuted(sound.toggleMuted())}
    >
      {muted ? "Sound: off" : "Sound: on"}
    </button>
  );
}

function exit(onExit: () => void): void {
  sound.play("back");
  onExit();
}

function Scoreboard({ standings, showRound }: { standings: readonly Standing[]; showRound: boolean }) {
  return (
    <div className="hud-panel" style={{ position: "absolute", top: 110, right: 16, minWidth: 188 }}>
      <div className="hud-label">Standings</div>
      {standings.map((s) => (
        <div
          key={s.id}
          style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: s.isLocal ? 700 : 400 }}
        >
          <span className="team-dot" style={{ background: dotColor(s) }} />
          <span
            style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
          >
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
      ))}
    </div>
  );
}

function MedalStandings({ standings }: { standings: readonly Standing[] }) {
  return (
    <div className="medal-row">
      {standings.map((s, i) => (
        <div className="medal-line" key={s.id}>
          {i < 3 ? (
            <img src={MEDALS[i]} alt={`#${i + 1}`} />
          ) : (
            <span className="medal-rank">#{i + 1}</span>
          )}
          <span className="team-dot" style={{ background: dotColor(s) }} />
          <span className="medal-name">
            {s.name}
            {s.isLocal ? " (you)" : ""}
          </span>
          <span className="medal-pts">{s.points} pts</span>
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
