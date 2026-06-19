import { useEffect, useState, type ReactNode } from "react";
import type { GameState, PumpPlayer } from "../game/store";
import { sound } from "../core/Sound";
import { onlineCount } from "../game/online";
import { truncateWallet } from "../solana/auth";
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
 * PumpDash HUD: connecting/error/finding overlays, the four side scores arranged
 * around the arena (the local side at the bottom), the dash cooldown, the
 * eliminated banner, the countdown, and the end screen with Play again.
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
        <div className="hud-error-title">Something went wrong</div>
        <span>{state.error || "Could not start the game."}</span>
        <button className="hud-button" onClick={() => exit(onExit)}>
          Back to menu
        </button>
      </Overlay>
    );
  }

  if (state.status === "connecting") {
    return (
      <Overlay>
        <div className="hud-spinner" />
        <span>Loading game...</span>
      </Overlay>
    );
  }

  if (state.matchPhase === "matchmaking" || state.matchPhase === "") {
    return (
      <Overlay>
        <div className="hud-spinner" />
        <div className="hud-mm-title">Finding players...</div>
        <Online />
      </Overlay>
    );
  }

  const playing = state.matchPhase === "playing";

  return (
    <div className="hud">
      <div className="hud-panel hud-topleft">
        <div className="hud-title">PumpDash</div>
        <div className="hud-sub">Block the ball. Last one standing wins.</div>
      </div>

      <div className="hud-panel hud-topright">
        <div className="hud-stat">
          <span className="hud-label">FPS</span>
          <span className="hud-value">{state.fps}</span>
        </div>
        <div className="hud-stat">
          <span className="hud-label">Alive</span>
          <span className="hud-value">{state.alivePlayers}</span>
        </div>
        <MuteButton />
      </div>

      {/* Four side scores around the arena. */}
      {state.players.map((p) => (
        <SideScore key={p.id} player={p} slot={slotFor(state.youSide, p.side)} />
      ))}

      {playing && state.banner && <div className="hud-banner">{state.banner}</div>}

      {playing && (
        <div className="dash-bar">
          {state.dashReady ? (
            <span className="dash-ready">DASH READY &middot; Space</span>
          ) : (
            <span className="dash-cool">Dash {state.dashCd.toFixed(1)}s</span>
          )}
        </div>
      )}

      {state.matchPhase === "countdown" && (
        <div className="hud-center-big">{state.timer > 0 ? state.timer : "Go!"}</div>
      )}

      {state.matchPhase === "ended" && (
        <Overlay>
          <Confetti />
          {state.isLocalWinner ? (
            <div className="hud-win-title">You win!</div>
          ) : (
            <div className="hud-win-title">{state.winnerName || "Nobody"} wins</div>
          )}
          {state.localPlacement > 0 && (
            <div className="hud-place">You placed #{state.localPlacement} of {state.players.length}</div>
          )}
          <div className="screen-actions">
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
        <div className="hud-hint">A / D or arrows: slide &middot; Space: dash</div>
      )}
    </div>
  );
}

function SideScore({ player, slot }: { player: PumpPlayer; slot: Slot }) {
  const cls = `side-score side-${slot}${player.isLocal ? " you" : ""}${player.alive ? "" : " out"}`;
  return (
    <div className={cls}>
      <div className="side-score-name">
        {player.name}
        {player.isLocal ? " (you)" : ""}
      </div>
      <div className="side-score-pts">{player.alive ? player.points : "OUT"}</div>
      {player.wallet && <div className="side-score-wallet">{truncateWallet(player.wallet)}</div>}
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
      {n.toLocaleString()} {compact ? "online" : "jugadores en línea"}
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

function Overlay({ children }: { children: ReactNode }) {
  return (
    <div className="hud">
      <div className="hud-loading">{children}</div>
    </div>
  );
}
