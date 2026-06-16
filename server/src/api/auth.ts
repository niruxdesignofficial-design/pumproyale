import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";
import { buildNonceMessage, isValidPublicKey, verifyWalletSignature } from "../solana/verify";
import { createSessionToken } from "../auth/session";

const NONCE_TTL_MS = 5 * 60 * 1000;
const MIN_REQUEST_INTERVAL_MS = 750;

interface NonceEntry {
  nonce: string;
  exp: number;
  lastRequest: number;
}

const nonces = new Map<string, NonceEntry>();

/**
 * Sign-in-with-wallet routes. The client requests a nonce, signs it with the
 * wallet (no key ever leaves the wallet), and posts the signature back; the
 * server verifies ed25519 ownership and issues a session token.
 */
export function registerAuthRoutes(app: FastifyInstance): void {
  app.get("/api/auth/nonce", async (request, reply) => {
    const wallet = (request.query as Record<string, unknown>)?.wallet;
    if (typeof wallet !== "string" || !isValidPublicKey(wallet)) {
      return reply.code(400).send({ error: "invalid wallet" });
    }

    const now = Date.now();
    const existing = nonces.get(wallet);
    if (existing && now - existing.lastRequest < MIN_REQUEST_INTERVAL_MS) {
      return reply.code(429).send({ error: "slow down" });
    }

    const nonce = crypto.randomBytes(24).toString("base64url");
    nonces.set(wallet, { nonce, exp: now + NONCE_TTL_MS, lastRequest: now });
    return reply.send({ nonce, message: buildNonceMessage(nonce) });
  });

  app.post("/api/auth/verify", async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const wallet = body.wallet;
    const signature = body.signature;
    if (typeof wallet !== "string" || typeof signature !== "string") {
      return reply.code(400).send({ error: "wallet and signature required" });
    }

    const entry = nonces.get(wallet);
    if (!entry || Date.now() > entry.exp) {
      nonces.delete(wallet);
      return reply.code(400).send({ error: "nonce expired, request a new one" });
    }

    const message = buildNonceMessage(entry.nonce);
    if (!verifyWalletSignature(wallet, message, signature)) {
      return reply.code(401).send({ error: "signature verification failed" });
    }

    // One-time use.
    nonces.delete(wallet);
    const token = createSessionToken(wallet);
    return reply.send({ token, wallet });
  });
}
