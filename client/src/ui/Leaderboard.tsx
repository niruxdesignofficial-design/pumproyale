import { useCallback, useEffect, useState } from "react";
import { getLocalLeaderboard, type LbRow } from "../game/localLeaderboard";
import { truncateWallet } from "../solana/auth";

/** Collapsible leaderboard: simulated players mixed with you (offline). */
export function Leaderboard() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<LbRow[]>([]);

  const refresh = useCallback(() => setRows(getLocalLeaderboard(25)), []);

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  return (
    <div className="lb">
      <button className="lb-toggle" onClick={() => setOpen((o) => !o)}>
        {open ? "Hide leaderboard" : "Leaderboard"}
      </button>
      {open && (
        <div className="lb-panel">
          <div className="lb-head">
            <span>Top players</span>
            <button className="lb-refresh" onClick={refresh}>
              Refresh
            </button>
          </div>
          <div className="lb-rows">
            <div className="lb-row lb-row-head">
              <span>#</span>
              <span>Player</span>
              <span>Wins</span>
              <span>Points</span>
            </div>
            {rows.map((r) => (
              <div className={`lb-row${r.isYou ? " lb-you" : ""}`} key={r.wallet}>
                <span className="lb-rank">{r.rank}</span>
                <span className="lb-name">
                  {r.name || "Player"}
                  {r.isYou ? " (you)" : ""}
                  <span className="lb-wallet">{truncateWallet(r.wallet)}</span>
                </span>
                <span>{r.wins}</span>
                <span className="lb-pts">{r.points}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
