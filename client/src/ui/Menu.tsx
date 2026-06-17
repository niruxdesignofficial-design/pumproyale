import { useState } from "react";
import { WalletPanel } from "./WalletPanel";
import { Leaderboard } from "./Leaderboard";
import { sound } from "../core/Sound";
import { getPlayerName, isValidPlayerName, setPlayerName } from "../game/name";

/** Main menu: title, required name entry, Play, and the wallet + leaderboard panels. */
export function Menu({ onPlay }: { onPlay: () => void }) {
  const [name, setName] = useState(getPlayerName());
  const valid = isValidPlayerName(name);

  const play = () => {
    sound.enable();
    if (!valid) {
      sound.play("error");
      return;
    }
    setPlayerName(name);
    sound.play("click");
    onPlay();
  };

  return (
    <div className="screen menu-screen">
      <WalletPanel />
      <div className="menu-hero">
        <h1 className="game-title">Party Royale</h1>
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
              if (e.key === "Enter") play();
            }}
          />
        </div>

        <button className="btn-primary btn-big" onClick={play} disabled={!valid}>
          Play
        </button>
        <p className="menu-hint">
          Soccer, gem rush, climbing, and target range — play them all, rack up points.
        </p>
      </div>
      <Leaderboard />
    </div>
  );
}
