import type { GameState } from "../game/store";

/**
 * Minimal heads-up display for Phase 1: a loading overlay until the first frame,
 * then an FPS readout, the loaded character label, and a notice when the
 * procedural placeholder is in use.
 */
export function Hud({ state }: { state: GameState }) {
  return (
    <div className="hud">
      {state.phase === "loading" && (
        <div className="hud-loading">
          <div className="hud-spinner" />
          <span>Loading scene...</span>
        </div>
      )}

      {state.phase === "ready" && (
        <>
          <div className="hud-panel hud-topleft">
            <div className="hud-title">Party Royale</div>
            <div className="hud-sub">Phase 1 - scaffold &amp; render</div>
          </div>

          <div className="hud-panel hud-topright">
            <div className="hud-stat">
              <span className="hud-label">FPS</span>
              <span className="hud-value">{state.fps}</span>
            </div>
            <div className="hud-stat">
              <span className="hud-label">Model</span>
              <span className="hud-value">{state.characterLabel}</span>
            </div>
          </div>

          {state.usingFallback && (
            <div className="hud-warn">
              Showing placeholder character. Run <code>pnpm assets:prepare</code> to load the
              KayKit model.
            </div>
          )}

          <div className="hud-hint">Drag to orbit, scroll to zoom</div>
        </>
      )}
    </div>
  );
}
