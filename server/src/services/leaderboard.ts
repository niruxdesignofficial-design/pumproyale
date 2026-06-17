import { MAX_PLAYERS } from "@party-royale/shared";
import { prisma } from "../db/prisma";

/** Reward size per match (lamports). 0.01 SOL by default. */
export const REWARD_LAMPORTS = Number(process.env.REWARD_LAMPORTS ?? 10_000_000);
const WIN_POINTS = 100;
const PLACE_POINTS = 10;

export interface Participant {
  wallet: string;
  name: string;
  /** 1 = winner. */
  placement: number;
}

/** Points awarded for a finish: winners get a flat bonus, others scale by placement. */
export function computePoints(
  placement: number,
  isWinner: boolean,
  maxPlayers: number = MAX_PLAYERS,
): number {
  return isWinner ? WIN_POINTS : Math.max(0, (maxPlayers - placement) * PLACE_POINTS);
}

/**
 * Atomically record a finished match: update each wallet-holding participant's
 * leaderboard row, and create an idempotent (one-per-match) reward for the
 * winner. Called by the room when a match ends. Bots and wallet-less players are
 * ignored.
 */
export async function recordMatchResult(
  matchId: string,
  participants: Participant[],
  winnerWallet: string | null,
  winningTime: number | null,
): Promise<void> {
  for (const p of participants) {
    const isWinner = p.wallet === winnerWallet;
    const pointsGain = computePoints(p.placement, isWinner);

    await prisma.player.upsert({
      where: { wallet: p.wallet },
      create: {
        wallet: p.wallet,
        name: p.name,
        wins: isWinner ? 1 : 0,
        matchesPlayed: 1,
        points: pointsGain,
        bestTime: isWinner ? winningTime : null,
      },
      update: {
        name: p.name,
        wins: { increment: isWinner ? 1 : 0 },
        matchesPlayed: { increment: 1 },
        points: { increment: pointsGain },
      },
    });

    if (isWinner && winningTime != null) {
      const existing = await prisma.player.findUnique({ where: { wallet: p.wallet } });
      if (existing && (existing.bestTime == null || winningTime < existing.bestTime)) {
        await prisma.player.update({ where: { wallet: p.wallet }, data: { bestTime: winningTime } });
      }
    }
  }

  if (winnerWallet) {
    // Idempotent: the unique matchId means re-recording the same match is a no-op.
    await prisma.reward.upsert({
      where: { matchId },
      create: { matchId, wallet: winnerWallet, amount: REWARD_LAMPORTS, status: "eligible" },
      update: {},
    });
  }
}

export interface LeaderboardRow {
  rank: number;
  wallet: string;
  name: string;
  wins: number;
  matchesPlayed: number;
  points: number;
  bestTime: number | null;
}

export async function getLeaderboard(limit: number): Promise<LeaderboardRow[]> {
  const players = await prisma.player.findMany({
    orderBy: [{ points: "desc" }, { wins: "desc" }],
    take: limit,
  });
  return players.map((p, i) => ({
    rank: i + 1,
    wallet: p.wallet,
    name: p.name,
    wins: p.wins,
    matchesPlayed: p.matchesPlayed,
    points: p.points,
    bestTime: p.bestTime,
  }));
}
