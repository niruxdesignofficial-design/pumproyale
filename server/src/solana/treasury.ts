import bs58 from "bs58";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  clusterApiUrl,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

// SECURITY: the treasury secret key lives ONLY here, on the server, loaded from
// the environment. It is never sent to the client.
//
// TODO(mainnet/legal): switching SOLANA_NETWORK to mainnet and distributing real
// value may implicate gambling, securities, and money-transmission regulations.
// That is the operator's responsibility. This defaults to devnet.
const RPC_URL = process.env.SOLANA_RPC_URL ?? clusterApiUrl("devnet");

let cached: Keypair | null | undefined;

function getTreasury(): Keypair | null {
  if (cached !== undefined) return cached;
  const secret = process.env.TREASURY_SECRET_KEY;
  if (!secret) {
    cached = null;
    return cached;
  }
  cached = Keypair.fromSecretKey(bs58.decode(secret));
  return cached;
}

export type TreasuryMode = "live" | "simulation";

/** "live" when a treasury key is configured, otherwise "simulation". */
export function treasuryMode(): TreasuryMode {
  return getTreasury() ? "live" : "simulation";
}

/**
 * Send `lamports` SOL from the treasury to `toWallet` on devnet and return the
 * transaction signature. With no treasury key configured the call runs in
 * simulation mode and returns a marker signature, so the reward flow (and its
 * idempotency) can be exercised without a funded wallet.
 */
export async function sendReward(toWallet: string, lamports: number): Promise<string> {
  const treasury = getTreasury();
  if (!treasury) {
    return `SIMULATED-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  const connection = new Connection(RPC_URL, "confirmed");
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: treasury.publicKey,
      toPubkey: new PublicKey(toWallet),
      lamports,
    }),
  );
  return sendAndConfirmTransaction(connection, tx, [treasury]);
}
