import type { FastifyInstance, FastifyRequest } from "fastify";
import { verifySessionToken } from "../auth/session";
import { getLeaderboard } from "../services/leaderboard";
import { ClaimError, claimReward, getRecentWinners, listClaimable } from "../services/rewards";
import { treasuryMode } from "../solana/treasury";

/** Resolve the authenticated wallet from a Bearer session token, or null. */
function authWallet(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  const session = verifySessionToken(header.slice("Bearer ".length).trim());
  return session?.wallet ?? null;
}

/** Leaderboard (public) and reward (authenticated) routes. */
export function registerGameRoutes(app: FastifyInstance): void {
  app.get("/api/leaderboard", async (request, reply) => {
    const raw = Number((request.query as Record<string, unknown>)?.limit ?? 50);
    const limit = Math.min(100, Math.max(1, Number.isFinite(raw) ? raw : 50));
    const players = await getLeaderboard(limit);
    return reply.send({ players });
  });

  app.get("/api/rewards/recent", async (request, reply) => {
    const raw = Number((request.query as Record<string, unknown>)?.limit ?? 8);
    const limit = Math.min(25, Math.max(1, Number.isFinite(raw) ? raw : 8));
    const winners = await getRecentWinners(limit);
    return reply.send({ winners });
  });

  app.get("/api/rewards/me", async (request, reply) => {
    const wallet = authWallet(request);
    if (!wallet) return reply.code(401).send({ error: "sign in required" });
    const rewards = await listClaimable(wallet);
    return reply.send({ rewards, mode: treasuryMode() });
  });

  app.post("/api/rewards/claim", async (request, reply) => {
    const wallet = authWallet(request);
    if (!wallet) return reply.code(401).send({ error: "sign in required" });

    const rewardId = (request.body as Record<string, unknown>)?.rewardId;
    if (typeof rewardId !== "string") return reply.code(400).send({ error: "rewardId required" });

    try {
      const result = await claimReward(wallet, rewardId);
      return reply.send(result);
    } catch (err) {
      if (err instanceof ClaimError) {
        return reply.code(409).send({ error: err.message });
      }
      request.log.error(err);
      return reply.code(500).send({ error: "reward transfer failed" });
    }
  });
}
