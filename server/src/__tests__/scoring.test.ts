import test from "node:test";
import assert from "node:assert/strict";
import { PLACE_POINTS } from "@party-royale/shared";
import { computePoints } from "../services/leaderboard";

test("the winner gets the win bonus", () => {
  assert.equal(computePoints(1, true, 4), 100);
});

test("points scale by placement for non-winners", () => {
  assert.equal(computePoints(2, false, 4), 20);
  assert.equal(computePoints(3, false, 4), 10);
  assert.equal(computePoints(4, false, 4), 0);
});

test("placement points award the round's leader the most", () => {
  // 1st..4th should be strictly decreasing so each round's leader gains the most.
  for (let i = 1; i < PLACE_POINTS.length; i++) {
    assert.ok(PLACE_POINTS[i - 1]! > PLACE_POINTS[i]!);
  }
});

test("highest cumulative points across rounds wins (no elimination)", () => {
  // Four players, four rounds. We sum placement points by each round's ranking
  // (ranking[r] is the player ids ordered best-first that round) and the match
  // winner is whoever has the most total points.
  const rankings = [
    ["a", "b", "c", "d"],
    ["b", "a", "d", "c"],
    ["a", "c", "b", "d"],
    ["c", "a", "b", "d"],
  ];
  const totals = new Map<string, number>();
  for (const order of rankings) {
    order.forEach((id, rank) => {
      totals.set(id, (totals.get(id) ?? 0) + (PLACE_POINTS[rank] ?? 0));
    });
  }
  const winner = [...totals.entries()].sort((x, y) => y[1] - x[1])[0]![0];
  // "a": 10+6+10+6 = 32, the clear leader; everyone played all four rounds.
  assert.equal(winner, "a");
  assert.equal(totals.get("a"), 32);
  assert.equal(totals.size, 4);
});
