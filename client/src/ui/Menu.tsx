import { useState } from "react";
import { Leaderboard } from "./Leaderboard";
import { CaBadge } from "./CaBadge";
import { Online } from "./Hud";
import { sound } from "../core/Sound";
import { getPlayerName, isValidPlayerName, setPlayerName } from "../game/name";
import { getPlayerWallet, isValidWallet, setPlayerWallet } from "../game/wallet";
import { setPlayMode } from "../game/matchMode";
import { isOnlineEnabled, type PlayMode } from "../net/NetClient";

/**
 * Main menu: title, name + wallet entry, online counter, Quick play, and (when a
 * game server is configured) "play with friends": create a private room to get a
 * shareable code, or join one by code. A wallet address is required to play.
 */
export function Menu({ onPlay }: { onPlay: () => void }) {
  const [name, setName] = useState(getPlayerName());
  const [wallet, setWallet] = useState(getPlayerWallet());
  const [code, setCode] = useState("");
  const [howTo, setHowTo] = useState(false);
  const nameOk = isValidPlayerName(name);
  const walletOk = isValidWallet(wallet);
  const canPlay = nameOk && walletOk;
  const online = isOnlineEnabled();

  const go = (mode: PlayMode) => {
    sound.enable();
    if (!canPlay) {
      sound.play("error");
      return;
    }
    if (mode.kind === "join" && mode.code.trim().length === 0) {
      sound.play("error");
      return;
    }
    setPlayerName(name);
    setPlayerWallet(wallet);
    setPlayMode(mode);
    sound.play("click");
    onPlay();
  };

  return (
    <div className="screen menu-screen">
      <div className="menu-hero">
        <h1 className="game-title">PumpDash</h1>
        <p className="game-sub">4 players, one arena. Block the ball. Last one standing wins.</p>
        <CaBadge />
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

        <div className="name-row">
          <span className="name-label">Your wallet address</span>
          <input
            className="name-input"
            value={wallet}
            maxLength={64}
            placeholder="Paste your Solana wallet address"
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => setWallet(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") go({ kind: "quick" });
            }}
          />
          {wallet.length > 0 && !walletOk && (
            <span className="name-warn">Enter a valid wallet address to play.</span>
          )}
        </div>

        <button className="btn-primary btn-big" onClick={() => go({ kind: "quick" })} disabled={!canPlay}>
          Quick play
        </button>

        {online && (
          <div className="menu-friends">
            <button
              className="btn-secondary"
              onClick={() => go({ kind: "create" })}
              disabled={!canPlay}
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
                disabled={!canPlay || code.trim().length === 0}
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

        <button className="link-btn" onClick={() => setHowTo((v) => !v)}>
          {howTo ? "Hide how to play" : "How to play"}
        </button>

        {howTo && (
          <div className="howto-card">
            <div className="howto-title">How to play PumpDash</div>
            <ul className="howto-list">
              <li>You guard one side of the arena.</li>
              <li>Slide along your side with A / D or the arrow keys.</li>
              <li>Block the ball so it does not pass your edge.</li>
              <li>Press Space to dash and smack the ball harder.</li>
              <li>Every ball that gets past you costs a point.</li>
              <li>Run out of points and you are out. Last one standing wins.</li>
            </ul>
          </div>
        )}
      </div>
      <Leaderboard />
    </div>
  );
}
