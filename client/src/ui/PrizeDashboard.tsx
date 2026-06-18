import { useEffect, useState } from "react";
import {
  getLocalLeaderboard,
  getRecentWinners,
  type LbRow,
  type WinnerRow,
} from "../game/localLeaderboard";
import { truncateWallet } from "../solana/auth";

/** Top-3 split of the hourly pool (50/30/20). */
const SHARE = [0.5, 0.3, 0.2];

/** Milliseconds until the next top-of-hour payout. */
function msToNextHour(): number {
  const now = new Date();
  return ((59 - now.getMinutes()) * 60 + (60 - now.getSeconds())) * 1000;
}

/** Devnet demo pool: resets each hour and grows toward the payout (2.0 -> 3.8 SOL). */
function simulatedPoolSol(): number {
  const now = new Date();
  const frac = (now.getMinutes() * 60 + now.getSeconds()) / 3600;
  return 2 + frac * 1.8;
}

function fmtCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function lamportsToSol(lamports: number): string {
  return (lamports / 1_000_000_000).toFixed(3);
}

/**
 * Hourly prize dashboard (simulated): the live SOL pool, a countdown to the next
 * :00 payout, this hour's top players + your projected reward, and a recent-winners
 * feed. All data is local/simulated; nothing touches a network or a chain.
 */
export function PrizeDashboard() {
  const [rows, setRows] = useState<LbRow[]>([]);
  const [winners, setWinners] = useState<WinnerRow[]>([]);
  const [, setTick] = useState(0);

  useEffect(() => {
    const load = () => {
      setRows(getLocalLeaderboard(10));
      setWinners(getRecentWinners(6));
    };
    load();
    const data = window.setInterval(load, 20000);
    const clock = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => {
      window.clearInterval(data);
      window.clearInterval(clock);
    };
  }, []);

  const pool = simulatedPoolSol();
  const myIdx = rows.findIndex((r) => r.isYou);
  const myProjected = myIdx >= 0 && myIdx < SHARE.length ? pool * SHARE[myIdx]! : 0;

  return (
    <div className="prize">
      <div className="prize-head">
        <span className="prize-title">Hourly prize pool</span>
        <span className="prize-net">DEVNET</span>
      </div>
      <div className="prize-pool">
        {pool.toFixed(2)} <span>SOL</span>
      </div>
      <div className="prize-countdown">
        Next payout in <b>{fmtCountdown(msToNextHour())}</b>
      </div>

      <div className="prize-section">This hour&apos;s top players</div>
      {rows.length === 0 ? (
        <div className="prize-empty">No players yet — win a match!</div>
      ) : (
        rows.slice(0, 5).map((r, i) => (
          <div className={`prize-row${r.isYou ? " me" : ""}`} key={r.wallet}>
            <span className="prize-rank">{i + 1}</span>
            <span className="prize-name">{r.name || truncateWallet(r.wallet)}</span>
            {i < 3 && <span className="prize-proj">~{(pool * SHARE[i]!).toFixed(2)}</span>}
            <span className="prize-pts">{r.points}</span>
          </div>
        ))
      )}

      <div className="prize-you">
        {myIdx >= 0
          ? `You're #${myIdx + 1}${myProjected > 0 ? ` · projected ~${myProjected.toFixed(2)} SOL` : ""}`
          : "Play a match to enter the board"}
      </div>

      {winners.length > 0 && (
        <>
          <div className="prize-section">Recent winners</div>
          {winners.map((w, i) => (
            <div className="prize-win" key={`${w.wallet}-${i}`}>
              <span className="prize-name">{w.name || truncateWallet(w.wallet)}</span>
              <span className="prize-amt">+{lamportsToSol(w.amount)}</span>
              <span className="prize-pending">SOL</span>
            </div>
          ))}
        </>
      )}

      <div className="prize-note">Simulated pool · for entertainment only</div>
    </div>
  );
}
