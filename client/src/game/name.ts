// The player's chosen display name. Required before joining a match; persisted
// to localStorage so it sticks across sessions. Mirrors selection.ts.

const KEY = "party-royale.name";
const MAX = 16;

let current = load();

function load(): string {
  try {
    return (localStorage.getItem(KEY) ?? "").slice(0, MAX);
  } catch {
    return "";
  }
}

export function getPlayerName(): string {
  return current.trim();
}

export function setPlayerName(name: string): void {
  current = name.slice(0, MAX);
  try {
    localStorage.setItem(KEY, current);
  } catch {
    // ignore (private mode etc.)
  }
}

export function isValidPlayerName(name: string): boolean {
  return name.trim().length >= 1 && name.trim().length <= MAX;
}
