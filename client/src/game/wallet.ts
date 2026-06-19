// The player's BNB Chain (BSC) wallet address, typed/pasted in the menu.
// Required before joining a match; persisted to localStorage so it sticks across
// sessions. Mirrors name.ts.

const KEY = "party-royale.wallet";
const MAX = 64;

// EVM / BNB Chain address: 0x followed by 40 hex characters.
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

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
