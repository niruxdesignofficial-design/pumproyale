import { test } from "node:test";
import assert from "node:assert/strict";
import { ARENA_HALF, PumpDashSim } from "../pumpdash/PumpDashSim";

function fourPlayers(bots = false): PumpDashSim {
  const sim = new PumpDashSim();
  for (const id of ["a", "b", "c", "d"]) sim.addPlayer(id, bots);
  return sim;
}

test("a ball past an undefended edge costs that player a point and resets to center", () => {
  const sim = fourPlayers();
  const bottom = [...sim.players.values()].find((p) => p.side === 1)!;
  const before = bottom.points;
  // Ball heading into the bottom edge far from the paddle (which sits at t=0).
  sim.balls.push({ x: 8, z: ARENA_HALF - 0.05, vx: 0, vz: 6 });
  sim.step(0.1);
  assert.equal(bottom.points, before - 1);
  assert.ok(Math.abs(sim.balls[0]!.x) < 0.6 && Math.abs(sim.balls[0]!.z) < 0.6);
});

test("reaching zero points eliminates the player", () => {
  const sim = fourPlayers();
  const bottom = [...sim.players.values()].find((p) => p.side === 1)!;
  bottom.points = 1;
  sim.balls.push({ x: 8, z: ARENA_HALF - 0.05, vx: 0, vz: 6 });
  sim.step(0.1);
  assert.equal(bottom.points, 0);
  assert.equal(bottom.alive, false);
});

test("last player alive ends the match and is the winner", () => {
  const sim = fourPlayers();
  const arr = [...sim.players.values()];
  arr[0]!.alive = false;
  arr[1]!.alive = false;
  arr[2]!.alive = false;
  sim.step(0.05);
  assert.ok(sim.ended);
  assert.equal(sim.winnerId, arr[3]!.id);
});

test("a covered edge bounces the ball back into the arena (no concede)", () => {
  const sim = fourPlayers();
  const bottom = [...sim.players.values()].find((p) => p.side === 1)!;
  const before = bottom.points;
  // Ball aimed right at the paddle (t=0).
  sim.balls.push({ x: 0, z: ARENA_HALF - 0.05, vx: 0, vz: 6 });
  sim.step(0.1);
  assert.equal(bottom.points, before);
  assert.ok(sim.balls[0]!.vz < 0); // reflected back inward
});

test("a bot goalkeeper moves toward an incoming ball", () => {
  const sim = new PumpDashSim();
  sim.addPlayer("bot", true);
  const bot = [...sim.players.values()][0]!;
  sim.balls.push({ x: 5, z: 0, vx: 0, vz: 6 });
  for (let i = 0; i < 20; i++) sim.step(0.05);
  assert.ok(bot.t > 1, `bot should slide toward the ball (t=${bot.t})`);
});
