import { useCallback, useEffect, useState } from "react";
import { fetchLeaderboard, type LeaderboardRow } from "../net/api";
import { truncateWallet } from "../solana/auth";

/** Collapsible leaderboard panel showing top players by points. */
export function Leaderboard() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await fetchLeaderboard(25));
    } catch {
      // leave previous rows on failure
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void refresh();
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
            <button className="lb-refresh" onClick={() => void refresh()}>
              Refresh
            </button>
          </div>
          {rows.length === 0 ? (
            <div className="lb-empty">{loading ? "Loading..." : "No players yet. Win a match!"}</div>
          ) : (
            <div className="lb-rows">
              <div className="lb-row lb-row-head">
                <span>#</span>
                <span>Player</span>
                <span>Wins</span>
                <span>Points</span>
              </div>
              {rows.map((r) => (
                <div className="lb-row" key={r.wallet}>
                  <span className="lb-rank">{r.rank}</span>
                  <span className="lb-name">{r.name || truncateWallet(r.wallet)}</span>
                  <span>{r.wins}</span>
                  <span className="lb-pts">{r.points}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
