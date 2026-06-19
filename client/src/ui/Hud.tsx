import { useEffect, useRef, useState, type ReactNode } from "react";
import { DASH_CD } from "@engine/pumpdash/PumpDashSim";
import type { GameState, PumpPlayer } from "../game/store";
import { sound } from "../core/Sound";
import { onlineCount } from "../game/online";
import { Confetti } from "./Confetti";

type Slot = "top" | "bottom" | "left" | "right";

// Map an arena side to a screen slot given which side the local player guards
// (the local side is always framed at the bottom of the screen).
const SLOTS: Record<number, Record<number, Slot>> = {
  0: { 0: "bottom", 1: "top", 2: "right", 3: "left" },
  1: { 1: "bottom", 0: "top", 2: "left", 3: "right" },
  2: { 2: "bottom", 3: "top", 0: "left", 1: "right" },
  3: { 3: "bottom", 2: "top", 0: "right", 1: "left" },
};
const IDENTITY: Record<number, Slot> = { 0: "top", 1: "bottom", 2: "left", 3: "right" };

function slotFor(youSide: number, side: number): Slot {
  if (youSide >= 0 && SLOTS[youSide]) return SLOTS[youSide]![side]!;
  return IDENTITY[side]!;
}

/**
 * PumpDash HUD: clean green/white cards. Overlays (loading, finding players,
 * countdown, end), the four side score cards arranged around the arena with the
 * local card marked + dash radial, the eliminated banner, and controls.
 */
export function Hud({
  state,
  onExit,
  onPlayAgain,
}: {
  state: GameState;
  onExit: () => void;
  onPlayAgain: () => void;
}) {
  if (state.status === "error") {
    return (
      <Overlay>
        <div className="ov-title">Something went wrong</div>
        <span className="ov-sub">{state.error || "Could not start the game."}</span>
        <button className="btn-primary" onClick={() => exit(onExit)}>
          Back to menu
        </button>
      </Overlay>
    );
  }

  if (state.status === "connecting") {
    return (
      <Overlay>
        <div className="hud-spinner" />
        <span className="ov-sub">Loading game...</span>
      </Overlay>
    );
  }

  if (state.matchPhase === "matchmaking" || state.matchPhase === "") {
    return (
      <Overlay>
        <div className="hud-spinner" />
        <div className="ov-title">Finding players...</div>
        <Online />
      </Overlay>
    );
  }

  const playing = state.matchPhase === "playing";

  return (
    <div className="hud">
      <div className="hud-card hud-topbar">
        <div className="hud-brand">PumpDash</div>
        <div className="hud-tag">Block the ball. Last one standing wins.</div>
      </div>

      <div className="hud-card hud-meta">
        <span className="meta-kv">
          <span className="meta-k">FPS</span>
          <span className="meta-v">{state.fps}</span>
        </span>
        <span className="meta-kv">
          <span className="meta-k">Alive</span>
          <span className="meta-v">{state.alivePlayers}</span>
        </span>
        <MuteButton />
      </div>

      {state.players.map((p) => (
        <SideScore
          key={p.id}
          player={p}
          slot={slotFor(state.youSide, p.side)}
          dashReady={state.dashReady}
          dashCd={state.dashCd}
        />
      ))}

      {playing && state.banner && <div className="hud-banner">{state.banner}</div>}

      {state.matchPhase === "countdown" && (
        <div className="hud-countdown">{state.timer > 0 ? state.timer : "Go!"}</div>
      )}

      {state.matchPhase === "ended" && (
        <Overlay>
          <Confetti />
          <div className="ov-title">
            {state.isLocalWinner ? "You win!" : `${state.winnerName || "Nobody"} wins`}
          </div>
          {state.localPlacement > 0 && (
            <div className="ov-sub">
              You placed #{state.localPlacement} of {state.players.length}
            </div>
          )}
          <div className="ov-actions">
            <button className="btn-secondary" onClick={() => exit(onExit)}>
              Menu
            </button>
            <button
              className="btn-primary"
              onClick={() => {
                sound.play("confirm");
                onPlayAgain();
              }}
            >
              Play again
            </button>
          </div>
        </Overlay>
      )}

      {(playing || state.matchPhase === "countdown") && (
        <div className="hud-controls">
          <kbd>A</kbd> <kbd>D</kbd> slide <span className="ctrl-sep" /> <kbd>Space</kbd> dash
        </div>
      )}
    </div>
  );
}

function SideScore({
  player,
  slot,
  dashReady,
  dashCd,
}: {
  player: PumpPlayer;
  slot: Slot;
  dashReady: boolean;
  dashCd: number;
}) {
  const out = !player.alive;
  const [bump, setBump] = useState(false);
  const prev = useRef(player.points);
  useEffect(() => {
    if (player.points < prev.current) {
      setBump(true);
      const t = setTimeout(() => setBump(false), 440);
      prev.current = player.points;
      return () => clearTimeout(t);
    }
    prev.current = player.points;
    return undefined;
  }, [player.points]);
  const cls = `pcard side-${slot}${player.isLocal ? " you" : ""}${out ? " out" : ""}${bump ? " bump" : ""}`;
  const pct = dashReady ? 100 : Math.max(0, Math.min(100, (1 - dashCd / DASH_CD) * 100));
  return (
    <div className={cls}>
      <div className="pcard-name">
        {player.name}
        {player.isLocal && <span className="pcard-you">YOU</span>}
      </div>
      <div className="pcard-score">{out ? "OUT" : player.points}</div>
      {player.isLocal && !out && (
        <div className="pcard-dash">
          <span
            className={`dash-dot${dashReady ? " ready" : ""}`}
            style={{ background: `conic-gradient(var(--brand-green) ${pct}%, rgba(255,255,255,0.18) 0)` }}
          />
          <span className="dash-label">{dashReady ? "Dash ready" : "Dash"}</span>
        </div>
      )}
    </div>
  );
}

/** A live-looking "players online" line (cosmetic, drifts over time). */
export function Online({ compact = false }: { compact?: boolean }) {
  const [n, setN] = useState(() => onlineCount());
  useEffect(() => {
    const t = window.setInterval(() => setN(onlineCount()), 2200);
    return () => window.clearInterval(t);
  }, []);
  return (
    <div className={compact ? "online online-compact" : "online"}>
      <span className="online-dot" />
      {n.toLocaleString()} online
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
      {muted ? "Muted" : "Sound"}
    </button>
  );
}

function exit(onExit: () => void): void {
  sound.play("back");
  onExit();
}

function Overlay({ children }: { children: ReactNode }) {
  return (
    <div className="hud">
      <div className="ov-card">{children}</div>
    </div>
  );
}
