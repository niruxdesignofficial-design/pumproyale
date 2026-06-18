import { API_BASE } from "../solana/auth";

export interface LeaderboardRow {
  rank: number;
  wallet: string;
  name: string;
  wins: number;
  matchesPlayed: number;
  points: number;
  bestTime: number | null;
}

export interface RewardRow {
  id: string;
  matchId: string;
  amount: number;
  createdAt: string;
}

export interface ClaimResult {
  signature: string;
  amount: number;
  mode: "live" | "simulation";
}

export async function fetchLeaderboard(limit = 25): Promise<LeaderboardRow[]> {
  const res = await fetch(`${API_BASE}/api/leaderboard?limit=${limit}`);
  if (!res.ok) throw new Error("Could not load leaderboard");
  return ((await res.json()) as { players: LeaderboardRow[] }).players;
}

export interface RecentWinner {
  wallet: string;
  name: string;
  amount: number;
  status: string;
  txSignature: string | null;
  createdAt: string;
}

export async function fetchRecentWinners(limit = 8): Promise<RecentWinner[]> {
  const res = await fetch(`${API_BASE}/api/rewards/recent?limit=${limit}`);
  if (!res.ok) throw new Error("Could not load recent winners");
  return ((await res.json()) as { winners: RecentWinner[] }).winners;
}

export async function fetchMyRewards(token: string): Promise<{ rewards: RewardRow[]; mode: string }> {
  const res = await fetch(`${API_BASE}/api/rewards/me`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Could not load rewards");
  return (await res.json()) as { rewards: RewardRow[]; mode: string };
}

export async function claimReward(token: string, rewardId: string): Promise<ClaimResult> {
  const res = await fetch(`${API_BASE}/api/rewards/claim`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ rewardId }),
  });
  const body = (await res.json()) as ClaimResult & { error?: string };
  if (!res.ok) throw new Error(body.error ?? "Claim failed");
  return body;
}

/** Lamports to SOL for display. */
export function lamportsToSol(lamports: number): string {
  return (lamports / 1_000_000_000).toFixed(3);
}
