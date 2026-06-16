import crypto from "node:crypto";

/**
 * Stateless session tokens proving a wallet signed in. A token is
 * base64url(payload).base64url(HMAC-SHA256(payload)) using SESSION_SECRET.
 * No private keys involved; this only attests "this wallet proved ownership".
 */
const SECRET = process.env.SESSION_SECRET ?? "dev-insecure-session-secret-change-me";
const TTL_MS = 60 * 60 * 1000; // 1 hour

interface SessionPayload {
  wallet: string;
  exp: number;
}

export function createSessionToken(wallet: string): string {
  const payload = base64url(JSON.stringify({ wallet, exp: Date.now() + TTL_MS } satisfies SessionPayload));
  const sig = sign(payload);
  return `${payload}.${sig}`;
}

export function verifySessionToken(token: string): { wallet: string } | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, sig] = parts as [string, string];
  const expected = sign(payload);
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SessionPayload;
    if (typeof data.wallet !== "string" || typeof data.exp !== "number") return null;
    if (Date.now() > data.exp) return null;
    return { wallet: data.wallet };
  } catch {
    return null;
  }
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
}

function base64url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}
