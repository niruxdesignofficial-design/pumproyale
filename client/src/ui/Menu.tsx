import { WalletPanel } from "./WalletPanel";
import { Leaderboard } from "./Leaderboard";

/** Main menu: title, Play, and the wallet + leaderboard panels. */
export function Menu({ onPlay }: { onPlay: () => void }) {
  return (
    <div className="screen menu-screen">
      <WalletPanel />
      <div className="menu-hero">
        <h1 className="game-title">Party Royale</h1>
        <p className="game-sub">4 players. 3 minigames. 1 winner.</p>
        <button className="btn-primary btn-big" onClick={onPlay}>
          Play
        </button>
        <p className="menu-hint">Last one standing wins. Survive the chaos.</p>
      </div>
      <Leaderboard />
    </div>
  );
}
