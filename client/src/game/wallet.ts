// The player's Solana wallet address, typed/pasted in the menu (not a Phantom
// connection). Required before joining a match; persisted to localStorage so it
// sticks across sessions. Mirrors name.ts.

const KEY = "party-royale.wallet";
const MAX = 64;

// Base58 (no 0, O, I, l), 32-44 chars — the shape of a Solana public key.
const ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

let current = load();

function load(): string {
  try {
    return (localStorage.getItem(KEY) ?? "").slice(0, MAX);
  } catch {
    return "";
  }
}

export function getPlayerWallet(): string {
  return current.trim();
}

export function setPlayerWallet(wallet: string): void {
  current = wallet.trim().slice(0, MAX);
  try {
    localStorage.setItem(KEY, current);
  } catch {
    // ignore (private mode etc.)
  }
}

export function isValidWallet(wallet: string): boolean {
  return ADDRESS_RE.test(wallet.trim());
}
