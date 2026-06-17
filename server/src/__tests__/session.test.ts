import test from "node:test";
import assert from "node:assert/strict";
import { createSessionToken, verifySessionToken } from "../auth/session";

test("a session token round-trips its wallet", () => {
  const token = createSessionToken("WalletABC123");
  assert.deepEqual(verifySessionToken(token), { wallet: "WalletABC123" });
});

test("a tampered token is rejected", () => {
  const token = createSessionToken("WalletABC123");
  const flipped = token.endsWith("A") ? `${token.slice(0, -1)}B` : `${token.slice(0, -1)}A`;
  assert.equal(verifySessionToken(flipped), null);
});

test("garbage tokens are rejected", () => {
  assert.equal(verifySessionToken("garbage"), null);
  assert.equal(verifySessionToken("a.b.c"), null);
  assert.equal(verifySessionToken(""), null);
});
