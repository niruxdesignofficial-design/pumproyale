import { prisma } from "../db/prisma";
import { sendReward, treasuryMode } from "../solana/treasury";

export class ClaimError extends Error {}

export interface ClaimableReward {
  id: string;
  matchId: string;
  amount: number;
  createdAt: string;
}

export async function listClaimable(wallet: string): Promise<ClaimableReward[]> {
  const rewards = await prisma.reward.findMany({
    where: { wallet, status: "eligible" },
    orderBy: { createdAt: "desc" },
  });
  return rewards.map((r) => ({
    id: r.id,
    matchId: r.matchId,
    amount: r.amount,
    createdAt: r.createdAt.toISOString(),
  }));
}

export interface ClaimResult {
  signature: string;
  amount: number;
  mode: "live" | "simulation";
}

/**
 * Claim a reward exactly once. The eligible -> claiming transition is an atomic
 * conditional update: if it changes zero rows the reward is already
 * claimed/claiming, so the claim is rejected (double-claim protection). On a
 * failed transfer the reward reverts to eligible for a later retry.
 */
export async function claimReward(wallet: string, rewardId: string): Promise<ClaimResult> {
  const reserved = await prisma.reward.updateMany({
    where: { id: rewardId, wallet, status: "eligible" },
    data: { status: "claiming" },
  });
  if (reserved.count === 0) {
    const existing = await prisma.reward.findUnique({ where: { id: rewardId } });
    if (!existing) throw new ClaimError("reward not found");
    if (existing.wallet !== wallet) throw new ClaimError("reward belongs to another wallet");
    if (existing.status === "claimed") throw new ClaimError("reward already claimed");
    throw new ClaimError("reward is being claimed");
  }

  const reward = await prisma.reward.findUniqueOrThrow({ where: { id: rewardId } });
  try {
    const signature = await sendReward(wallet, reward.amount);
    await prisma.reward.update({
      where: { id: rewardId },
      data: { status: "claimed", txSignature: signature, claimedAt: new Date() },
    });
    return { signature, amount: reward.amount, mode: treasuryMode() };
  } catch (err) {
    // Roll back so the player can retry.
    await prisma.reward.update({ where: { id: rewardId }, data: { status: "eligible" } });
    throw err;
  }
}

export interface RecentWinner {
  wallet: string;
  name: string;
  amount: number;
  status: string;
  txSignature: string | null;
  createdAt: string;
}

/** Most recent match winners (public) for the prize dashboard's winners feed. */
export async function getRecentWinners(limit: number): Promise<RecentWinner[]> {
  const rewards = await prisma.reward.findMany({ orderBy: { createdAt: "desc" }, take: limit });
  const wallets = [...new Set(rewards.map((r) => r.wallet))];
  const players = await prisma.player.findMany({ where: { wallet: { in: wallets } } });
  const nameByWallet = new Map(players.map((p) => [p.wallet, p.name]));
  return rewards.map((r) => ({
    wallet: r.wallet,
    name: nameByWallet.get(r.wallet) ?? "",
    amount: r.amount,
    status: r.status,
    txSignature: r.txSignature,
    createdAt: r.createdAt.toISOString(),
  }));
}
