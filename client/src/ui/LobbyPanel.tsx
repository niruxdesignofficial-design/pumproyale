import { MAX_PLAYERS, teamColor } from "@party-royale/shared";
import type { GameState } from "../game/store";

function colorHex(index: number): string {
  return `#${teamColor(index).toString(16).padStart(6, "0")}`;
}

/**
 * Compact lobby bar shown while waiting. It stays out of the way so the player
 * can run the 3D lobby parkour underneath it.
 */
export function LobbyPanel({ state }: { state: GameState }) {
  return (
    <div className="lobby-bar">
      <div className="lobby-bar-title">LOBBY</div>
      {state.roomCode && (
        <div className="lobby-code">
          Invite code: <span className="lobby-code-value">{state.roomCode}</span>
        </div>
      )}
      <div className="lobby-bar-sub">
        {state.playerCount}/{MAX_PLAYERS} &middot; starting in {state.timer}s &middot; warm up on the
        parkour!
      </div>
      <div className="lobby-players">
        {state.standings.length > 0
          ? state.standings.map((p) => (
              <span key={p.id} className="lobby-player">
                <span className="lobby-dot" style={{ background: colorHex(p.colorIndex) }} />
                {p.name}
                {p.isLocal ? " (you)" : ""}
              </span>
            ))
          : (
              <span className="lobby-player">
                <span className="lobby-dot" style={{ background: colorHex(0) }} />
                Waiting...
              </span>
            )}
      </div>
    </div>
  );
}
