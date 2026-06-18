// Visual-only fake Solana wallets for simulated opponents/leaderboard. These are
// NOT real addresses and never touch any chain — purely cosmetic (truncated in the
// UI via truncateWallet from solana/auth).

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** A base58-looking ~44-char string in the shape of a Solana public key. */
export function randomWallet(): string {
  let out = "";
  for (let i = 0; i < 44; i++) out += BASE58[Math.floor(Math.random() * BASE58.length)];
  return out;
}
