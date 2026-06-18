/** Human-looking opponent names (no "bot" anywhere) so a match reads as real players. */
export const BOT_NAMES = [
  "Lucas", "Mia", "Noah", "Zoe", "Leo", "Ava", "Max", "Emma", "Theo", "Lily",
  "Hugo", "Nora", "Liam", "Sofia", "Ben", "Cleo", "Finn", "Ruby", "Kai", "Luna",
  "Sam", "Ivy", "Dylan", "Maya", "Jack", "Nina", "Milo", "Ella", "Axel", "Vera",
  "Owen", "Aria", "Eli", "Mila", "Jude", "Nova", "Ezra", "Iris", "Cole", "Wren",
];

/** A human name not already taken in this match (falls back to name+number). */
export function pickBotName(taken: Set<string>): string {
  const free = BOT_NAMES.filter((n) => !taken.has(n));
  if (free.length > 0) return free[Math.floor(Math.random() * free.length)]!;
  const base = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)]!;
  return `${base}${Math.floor(Math.random() * 90) + 10}`;
}
