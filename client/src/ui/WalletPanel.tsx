import { useCallback, useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { getAuthToken, signInWithWallet, truncateWallet } from "../solana/auth";
import { claimReward, fetchMyRewards, lamportsToSol, type RewardRow } from "../net/api";

type SignInStatus = "idle" | "signing" | "signed" | "error";

/**
 * Wallet connect + sign-in + reward claim. Connect shows the pubkey; "Sign in"
 * proves ownership (nonce -> sign -> verify) on devnet; once signed in, any
 * eligible match rewards can be claimed (idempotent, server-signed).
 */
export function WalletPanel() {
  const { publicKey, signMessage, connected } = useWallet();
  const [status, setStatus] = useState<SignInStatus>("idle");
  const [error, setError] = useState("");
  const [rewards, setRewards] = useState<RewardRow[]>([]);
  const [claimMsg, setClaimMsg] = useState("");

  const loadRewards = useCallback(async () => {
    const token = getAuthToken();
    if (!token) return;
    try {
      const res = await fetchMyRewards(token);
      setRewards(res.rewards);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (status === "signed") void loadRewards();
  }, [status, loadRewards]);

  const onSignIn = async () => {
    if (!publicKey || !signMessage) return;
    setStatus("signing");
    setError("");
    try {
      await signInWithWallet(publicKey.toBase58(), signMessage);
      setStatus("signed");
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "Sign-in failed");
    }
  };

  const onClaim = async () => {
    const token = getAuthToken();
    const reward = rewards[0];
    if (!token || !reward) return;
    setClaimMsg("Claiming...");
    try {
      const res = await claimReward(token, reward.id);
      setClaimMsg(
        `Claimed ${lamportsToSol(res.amount)} SOL (${res.mode}) - tx ${res.signature.slice(0, 8)}...`,
      );
      setRewards((rs) => rs.slice(1));
    } catch (e) {
      setClaimMsg(e instanceof Error ? e.message : "Claim failed");
    }
  };

  return (
    <div className="wallet-panel">
      <WalletMultiButton />
      {connected && status !== "signed" && (
        <button className="wallet-signin" onClick={onSignIn} disabled={status === "signing"}>
          {status === "signing" ? "Signing..." : "Sign in"}
        </button>
      )}
      {status === "signed" && publicKey && (
        <span className="wallet-badge wallet-ok">
          Signed in {truncateWallet(publicKey.toBase58())}
        </span>
      )}
      {status === "signed" && rewards.length > 0 && (
        <button className="wallet-claim" onClick={onClaim}>
          Claim reward ({lamportsToSol(rewards[0]!.amount)} SOL)
        </button>
      )}
      {claimMsg && <span className="wallet-badge wallet-ok">{claimMsg}</span>}
      {status === "error" && <span className="wallet-badge wallet-err">{error}</span>}
      <span className="wallet-net">devnet</span>
    </div>
  );
}
