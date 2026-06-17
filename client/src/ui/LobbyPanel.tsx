import { MAX_PLAYERS, teamColor } from "@party-royale/shared";
import type { GameState } from "../game/store";

function colorHex(index: number): string {
  return `#${teamColor(index).toString(16).padStart(6, "0")}`;
}

/** Tiny top-down course previews (the lobby "minimap" of the parkurs). */
const COURSES: { name: string; svg: JSX.Element }[] = [
  {
    name: "Soccer",
    svg: (
      <svg viewBox="0 0 100 70">
        <rect x="6" y="8" width="88" height="54" rx="4" fill="#2f6b3a" stroke="#cfe9d6" />
        <line x1="50" y1="8" x2="50" y2="62" stroke="#cfe9d6" strokeDasharray="3 3" />
        <rect x="2" y="28" width="6" height="14" fill="#57c1ff" />
        <rect x="92" y="28" width="6" height="14" fill="#ff5a5a" />
        <circle cx="50" cy="35" r="4" fill="#fff" stroke="#222" />
      </svg>
    ),
  },
  {
    name: "Gem Rush",
    svg: (
      <svg viewBox="0 0 100 70">
        {Array.from({ length: 24 }).map((_, i) => (
          <rect
            key={i}
            x={10 + (i % 6) * 13}
            y={8 + Math.floor(i / 6) * 13}
            width="11"
            height="11"
            rx="2"
            fill={(i + Math.floor(i / 6)) % 2 ? "#57c1ff" : "#ff6fae"}
          />
        ))}
        <circle cx="36" cy="34" r="3" fill="#ffd24d" />
        <circle cx="62" cy="21" r="3" fill="#5fe0b0" />
        <circle cx="49" cy="47" r="3" fill="#ff5a5a" />
      </svg>
    ),
  },
  {
    name: "Tower Climb",
    svg: (
      <svg viewBox="0 0 100 70">
        <polyline points="14,62 26,50 30,38 24,26 34,14" fill="none" stroke="#57c1ff" strokeWidth="3" />
        <polyline points="86,62 74,48 78,32 70,18 60,12" fill="none" stroke="#ffd24d" strokeWidth="3" />
        <circle cx="48" cy="9" r="5" fill="#ffd24d" stroke="#222" />
        <text x="50" y="68" fill="#9aa6bd" fontSize="8" textAnchor="middle">
          easy / hard
        </text>
      </svg>
    ),
  },
  {
    name: "Target Range",
    svg: (
      <svg viewBox="0 0 100 70">
        <rect x="6" y="8" width="88" height="54" rx="4" fill="#caa46a" stroke="#efe0c0" />
        <rect x="6" y="44" width="88" height="5" fill="#8a6a3a" />
        {[24, 50, 76].map((x) => (
          <g key={x}>
            <circle cx={x} cy="24" r="7" fill="#fff" stroke="#d33" strokeWidth="2" />
            <circle cx={x} cy="24" r="3" fill="#d33" />
          </g>
        ))}
      </svg>
    ),
  },
];

/** The lobby overlay shown while waiting for players. */
export function LobbyPanel({ state }: { state: GameState }) {
  return (
    <div className="lobby">
      <div className="lobby-card">
        <h2 className="lobby-title">LOBBY</h2>
        <p className="lobby-sub">
          {state.playerCount}/{MAX_PLAYERS} players &middot; starting in {state.timer}s &middot; bots
          fill empty slots
        </p>
        <div className="lobby-players">
          {state.standings.length > 0
            ? state.standings.map((p) => (
                <span key={p.id} className="lobby-player">
                  <span className="lobby-dot" style={{ background: colorHex(p.colorIndex) }} />
                  {p.name}
                  {p.isLocal ? " (you)" : ""}
                </span>
              ))
            : Array.from({ length: state.playerCount }).map((_, i) => (
                <span key={i} className="lobby-player">
                  <span className="lobby-dot" style={{ background: colorHex(i) }} />
                  Player {i + 1}
                </span>
              ))}
        </div>
        <div className="lobby-maps">
          {COURSES.map((c) => (
            <div className="map-card" key={c.name}>
              {c.svg}
              <span className="map-card-name">{c.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
