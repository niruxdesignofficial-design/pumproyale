import { useState } from "react";
import { WalletPanel } from "./WalletPanel";
import { Leaderboard } from "./Leaderboard";
import { PrizeDashboard } from "./PrizeDashboard";
import { Online } from "./Hud";
import { sound } from "../core/Sound";
import { getPlayerName, isValidPlayerName, setPlayerName } from "../game/name";
import { setPlayMode } from "../game/matchMode";
import { isOnlineEnabled, type PlayMode } from "../net/NetClient";

/**
 * Main menu: title, name entry, online counter, Quick play, and (when a game
 * server is configured) "play with friends": create a private room to get a
 * shareable code, or join one by code.
 */
export function Menu({ onPlay }: { onPlay: () => void }) {
  const [name, setName] = useState(getPlayerName());
  const [code, setCode] = useState("");
  const valid = isValidPlayerName(name);
  const online = isOnlineEnabled();

  const go = (mode: PlayMode) => {
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
      <PrizeDashboard />
      <div className="menu-hero">
        <h1 className="game-title">PumpRoyale</h1>
        <p className="game-sub">4 players. 4 minigames. Highest points wins.</p>
        <Online />

        <div className="name-row">
          <span className="name-label">Enter your name</span>
          <input
            className="name-input"
            value={name}
            maxLength={16}
            placeholder="Your name"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") go({ kind: "quick" });
            }}
          />
        </div>

        <button className="btn-primary btn-big" onClick={() => go({ kind: "quick" })} disabled={!valid}>
          Quick play
        </button>

        {online && (
          <div className="menu-friends">
            <button
              className="btn-secondary"
              onClick={() => go({ kind: "create" })}
              disabled={!valid}
            >
              Create private game
            </button>
            <div className="name-row join-row">
              <input
                className="name-input"
                value={code}
                maxLength={16}
                placeholder="Game code"
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") go({ kind: "join", code });
                }}
              />
              <button
                className="btn-secondary"
                onClick={() => go({ kind: "join", code })}
                disabled={!valid || code.trim().length === 0}
              >
                Join with code
              </button>
            </div>
          </div>
        )}

        <p className="menu-hint">
          {online
            ? "Quick play matches you with players + bots. Create a private game to get a code to share with friends."
            : "Jump into a match with players from around the world."}
        </p>
      </div>
      <Leaderboard />
    </div>
  );
}
