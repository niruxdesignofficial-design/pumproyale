import test from "node:test";
import assert from "node:assert/strict";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { buildNonceMessage, verifyWalletSignature } from "../solana/verify";

const enc = (s: string) => new TextEncoder().encode(s);

test("a valid wallet signature verifies", () => {
  const kp = nacl.sign.keyPair();
  const wallet = bs58.encode(kp.publicKey);
  const message = buildNonceMessage("nonce-123");
  const signature = bs58.encode(nacl.sign.detached(enc(message), kp.secretKey));
  assert.equal(verifyWalletSignature(wallet, message, signature), true);
});

test("a signature over a different message fails", () => {
  const kp = nacl.sign.keyPair();
  const wallet = bs58.encode(kp.publicKey);
  const signature = bs58.encode(nacl.sign.detached(enc(buildNonceMessage("a")), kp.secretKey));
  assert.equal(verifyWalletSignature(wallet, buildNonceMessage("b"), signature), false);
});

test("a signature from another key (impersonation) fails", () => {
  const owner = nacl.sign.keyPair();
  const impostor = nacl.sign.keyPair();
  const wallet = bs58.encode(owner.publicKey);
  const message = buildNonceMessage("nonce");
  const signature = bs58.encode(nacl.sign.detached(enc(message), impostor.secretKey));
  assert.equal(verifyWalletSignature(wallet, message, signature), false);
});
