import test, { after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Point the DB at a throwaway SQLite file and push the schema before importing
// any prisma-backed code, so this test is fully self-contained.
const here = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(here, "../..");
const dbFile = path.join(mkdtempSync(path.join(tmpdir(), "party-royale-test-")), "test.db");
process.env.DATABASE_URL = `file:${dbFile}`;

execFileSync(
  path.join(serverDir, "node_modules/.bin/prisma"),
  ["db", "push", "--skip-generate", "--accept-data-loss"],
  { cwd: serverDir, env: { ...process.env }, stdio: "ignore" },
);

const { recordMatchResult, getLeaderboard } = await import("../services/leaderboard");
const { listClaimable, claimReward, ClaimError } = await import("../services/rewards");
const { prisma } = await import("../db/prisma");

after(async () => {
  await prisma.$disconnect();
});

test("a match creates exactly one reward, even if recorded twice", async () => {
  const wallet = `WinnerA${Date.now()}`;
  const matchId = `match-a-${Date.now()}`;
  await recordMatchResult(matchId, [{ wallet, name: "A", placement: 1 }], wallet, 10);
  await recordMatchResult(matchId, [{ wallet, name: "A", placement: 1 }], wallet, 10);
  assert.equal(await prisma.reward.count({ where: { matchId } }), 1);
});

test("a reward can be claimed exactly once", async () => {
  const wallet = `WinnerB${Date.now()}`;
  const matchId = `match-b-${Date.now()}`;
  await recordMatchResult(matchId, [{ wallet, name: "B", placement: 1 }], wallet, 9);

  const claimable = await listClaimable(wallet);
  assert.equal(claimable.length, 1);

  const result = await claimReward(wallet, claimable[0]!.id);
  assert.ok(result.signature.length > 0);

  await assert.rejects(
    () => claimReward(wallet, claimable[0]!.id),
    (err) => err instanceof ClaimError,
  );
  assert.equal((await listClaimable(wallet)).length, 0);
});

test("the leaderboard is ordered by points descending", async () => {
  await recordMatchResult(
    `match-c-${Date.now()}`,
    [
      { wallet: `Hi${Date.now()}`, name: "Hi", placement: 1 },
      { wallet: `Lo${Date.now()}`, name: "Lo", placement: 4 },
    ],
    `Hi${Date.now()}`,
    8,
  );
  const rows = await getLeaderboard(50);
  for (let i = 1; i < rows.length; i++) {
    assert.ok(rows[i - 1]!.points >= rows[i]!.points);
  }
});
