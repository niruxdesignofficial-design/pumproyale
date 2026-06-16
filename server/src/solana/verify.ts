import bs58 from "bs58";
import nacl from "tweetnacl";
import { PublicKey } from "@solana/web3.js";

/** The message a wallet signs to prove ownership. Must match the client. */
export function buildNonceMessage(nonce: string): string {
  return `Party Royale sign-in\n\nSign this message to prove you own this wallet.\nNonce: ${nonce}`;
}

/**
 * Verify that `signatureBase58` is a valid ed25519 signature of `message` by the
 * given wallet public key. No private key is involved; this only checks a
 * signature the wallet produced in the browser.
 */
export function verifyWalletSignature(
  wallet: string,
  message: string,
  signatureBase58: string,
): boolean {
  try {
    const pubkey = new PublicKey(wallet);
    const signature = bs58.decode(signatureBase58);
    const messageBytes = new TextEncoder().encode(message);
    return nacl.sign.detached.verify(messageBytes, signature, pubkey.toBytes());
  } catch {
    return false;
  }
}

/** True if a string is a valid base58 Solana public key. */
export function isValidPublicKey(value: string): boolean {
  try {
    return Boolean(new PublicKey(value));
  } catch {
    return false;
  }
}
