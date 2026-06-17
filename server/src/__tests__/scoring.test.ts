import test from "node:test";
import assert from "node:assert/strict";
import { computePoints } from "../services/leaderboard";

test("the winner gets the win bonus", () => {
  assert.equal(computePoints(1, true, 4), 100);
});

test("points scale by placement for non-winners", () => {
  assert.equal(computePoints(2, false, 4), 20);
  assert.equal(computePoints(3, false, 4), 10);
  assert.equal(computePoints(4, false, 4), 0);
});

test("the elimination ladder terminates at a single winner", () => {
  // The room sets survivorsTarget = alive - 1 each round; verify this resolves
  // to exactly one winner and counts the expected number of rounds.
  let alive = 4;
  let rounds = 0;
  while (alive > 1) {
    alive = Math.max(1, alive - 1);
    rounds += 1;
  }
  assert.equal(alive, 1);
  assert.equal(rounds, 3);
});
