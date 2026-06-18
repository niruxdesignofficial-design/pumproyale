// Simulated, offline leaderboard. A persistent pool of fictitious players (name +
// fake Solana wallet + points) lives in localStorage and drifts a little between
// matches so it looks live. The real player is merged in and flagged `isYou`.
// Nothing here touches a network or a chain.

import { BOT_NAMES } from "./botNames";
import { randomWallet } from "./fakeWallet";
import { getPlayerName } from "./name";
import { getAuthWallet } from "../solana/auth";

export interface LbRow {
  rank: number;
  name: string;
  wallet: string;
  points: number;
  wins: number;
  isYou: boolean;
}

export interface WinnerRow {
  name: string;
  wallet: string;
  amount: number; // lamports (cosmetic)
}

interface FakePlayer {
  name: string;
  wallet: string;
  points: number;
  wins: number;
}
interface Store {
  pool: FakePlayer[];
  mePoints: number;
  meWins: number;
  meId: string;
}

const KEY = "pumproyale.leaderboard.v1";
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]!;

function seed(): Store {
  const names = [...BOT_NAMES].sort(() => Math.random() - 0.5).slice(0, 18);
  const pool = names.map((name) => ({
    name,
    wallet: randomWallet(),
    points: Math.round(rand(60, 520)),
    wins: Math.round(rand(0, 14)),
  }));
  return { pool, mePoints: 0, meWins: 0, meId: randomWallet() };
}

function load(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Store;
      if (s?.pool?.length) return s;
    }
  } catch {
    /* ignore */
  }
  const s = seed();
  save(s);
  return s;
}

function save(s: Store): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

/** The local player's row identity (connected wallet, else a stable local id). */
function meWallet(s: Store): string {
  return getAuthWallet() ?? s.meId;
}

/** Leaderboard rows: fictitious players + you, ranked by points. */
export function getLocalLeaderboard(limit = 25): LbRow[] {
  const s = load();
  const rows: Omit<LbRow, "rank">[] = s.pool.map((p) => ({
    name: p.name,
    wallet: p.wallet,
    points: p.points,
    wins: p.wins,
    isYou: false,
  }));
  rows.push({
    name: getPlayerName() || "You",
    wallet: meWallet(s),
    points: s.mePoints,
    wins: s.meWins,
    isYou: true,
  });
  rows.sort((a, b) => b.points - a.points || b.wins - a.wins);
  return rows.slice(0, limit).map((r, i) => ({ ...r, rank: i + 1 }));
}

/** A live-looking recent-winners feed (cosmetic SOL amounts). */
export function getRecentWinners(limit = 6): WinnerRow[] {
  const s = load();
  const out: WinnerRow[] = [];
  for (let i = 0; i < limit; i++) {
    const p = pick(s.pool);
    out.push({ name: p.name, wallet: p.wallet, amount: Math.round(rand(8, 60)) * 1_000_000 });
  }
  return out;
}

/** Fold a finished match into the simulated board: bump you, nudge a few rivals. */
export function recordLocalResult(
  _name: string,
  _wallet: string | null,
  points: number,
  placement: number,
): void {
  const s = load();
  s.mePoints += Math.max(0, points);
  if (placement === 1) s.meWins += 1;
  // Simulate other players having been active too.
  for (let i = 0; i < 5; i++) {
    const p = pick(s.pool);
    p.points += Math.round(rand(2, 22));
    if (Math.random() < 0.15) p.wins += 1;
  }
  save(s);
}
