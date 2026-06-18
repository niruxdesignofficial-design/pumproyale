import { useState } from "react";
import { WalletPanel } from "./WalletPanel";
import { Leaderboard } from "./Leaderboard";
import { sound } from "../core/Sound";
import { getPlayerName, isValidPlayerName, setPlayerName } from "../game/name";
import { setPlayMode } from "../game/matchMode";
import type { PlayMode } from "../net/NetClient";

/** Main menu: title, required name entry, play options (quick / private), wallet. */
export function Menu({ onPlay }: { onPlay: () => void }) {
  const [name, setName] = useState(getPlayerName());
  const [code, setCode] = useState("");
  const [showJoin, setShowJoin] = useState(false);
  const valid = isValidPlayerName(name);

  const start = (mode: PlayMode) => {
    sound.enable();
    if (!valid) {
      sound.play("error");
      return;
    }
    if (mode.kind === "join" && mode.code.trim().length === 0) {
      sound.play("error");
      return;
    }
    setPlayerName(name);
    setPlayMode(mode);
    sound.play("click");
    onPlay();
  };

  return (
    <div className="screen menu-screen">
      <WalletPanel />
      <div className="menu-hero">
        <h1 className="game-title">PumpRoyale</h1>
        <p className="game-sub">4 players. 4 minigames. Highest points wins.</p>

        <div className="name-row">
          <span className="name-label">Enter your name</span>
          <input
            className="name-input"
            value={name}
            maxLength={16}
            placeholder="Your name"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") start({ kind: "quick" });
            }}
          />
        </div>

        <button className="btn-primary btn-big" onClick={() => start({ kind: "quick" })} disabled={!valid}>
          Quick play
        </button>

        <div className="menu-friends">
          <button className="btn-secondary" onClick={() => start({ kind: "create" })} disabled={!valid}>
            Create private game
          </button>
          <button className="btn-secondary" onClick={() => setShowJoin((v) => !v)}>
            Join with code
          </button>
        </div>

        {showJoin && (
          <div className="name-row join-row">
            <input
              className="name-input"
              value={code}
              placeholder="Game code"
              onChange={(e) => setCode(e.target.value.trim())}
              onKeyDown={(e) => {
                if (e.key === "Enter") start({ kind: "join", code });
              }}
            />
            <button
              className="btn-primary"
              onClick={() => start({ kind: "join", code })}
              disabled={!valid || code.trim().length === 0}
            >
              Join
            </button>
          </div>
        )}

        <p className="menu-hint">
          Quick play fills with friends + bots. Create a private game to get a code to share.
        </p>
      </div>
      <Leaderboard />
    </div>
  );
}
