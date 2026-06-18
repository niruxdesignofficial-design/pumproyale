import { useState } from "react";
import { WalletPanel } from "./WalletPanel";
import { Leaderboard } from "./Leaderboard";
import { PrizeDashboard } from "./PrizeDashboard";
import { Online } from "./Hud";
import { sound } from "../core/Sound";
import { getPlayerName, isValidPlayerName, setPlayerName } from "../game/name";

/** Main menu: title, name entry, online counter, and Quick play (offline match). */
export function Menu({ onPlay }: { onPlay: () => void }) {
  const [name, setName] = useState(getPlayerName());
  const valid = isValidPlayerName(name);

  const start = () => {
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
              if (e.key === "Enter") start();
            }}
          />
        </div>

        <button className="btn-primary btn-big" onClick={start} disabled={!valid}>
          Quick play
        </button>

        <p className="menu-hint">
          Jump into a match with players from around the world.
        </p>
      </div>
      <Leaderboard />
    </div>
  );
}
