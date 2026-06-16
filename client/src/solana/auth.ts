import bs58 from "bs58";

/** REST API base URL: env override, else the page host on the API port. */
export const API_BASE = (() => {
  const fromEnv = import.meta.env.VITE_API_URL;
  if (typeof fromEnv === "string" && fromEnv.length > 0) return fromEnv;
  const host = typeof location !== "undefined" ? location.hostname : "localhost";
  return `http://${host}:3001`;
})();

let currentWallet: string | null = null;
let currentToken: string | null = null;

/** The wallet the player signed in with (passed to the match on join). */
export function getAuthWallet(): string | null {
  return currentWallet;
}

export function getAuthToken(): string | null {
  return currentToken;
}

export function clearAuth(): void {
  currentWallet = null;
  currentToken = null;
}

/**
 * Sign-in-with-wallet: request a nonce, sign it in the wallet, and post the
 * signature back for the server to verify. No private key ever leaves the
 * wallet. On success the session token is stored for later authenticated calls.
 */
export async function signInWithWallet(
  wallet: string,
  signMessage: (message: Uint8Array) => Promise<Uint8Array>,
): Promise<void> {
  const nonceRes = await fetch(`${API_BASE}/api/auth/nonce?wallet=${encodeURIComponent(wallet)}`);
  if (!nonceRes.ok) throw new Error("Could not request a sign-in nonce");
  const { message } = (await nonceRes.json()) as { message: string };

  const signature = await signMessage(new TextEncoder().encode(message));

  const verifyRes = await fetch(`${API_BASE}/api/auth/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ wallet, signature: bs58.encode(signature) }),
  });
  if (!verifyRes.ok) {
    const err = (await verifyRes.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? "Signature verification failed");
  }

  const { token } = (await verifyRes.json()) as { token: string };
  currentWallet = wallet;
  currentToken = token;
}

/** Shorten a base58 public key for display. */
export function truncateWallet(wallet: string): string {
  return wallet.length > 8 ? `${wallet.slice(0, 4)}...${wallet.slice(-4)}` : wallet;
}
