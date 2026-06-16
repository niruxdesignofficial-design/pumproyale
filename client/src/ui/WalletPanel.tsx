import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { signInWithWallet, truncateWallet } from "../solana/auth";

type SignInStatus = "idle" | "signing" | "signed" | "error";

/**
 * Wallet connect + sign-in-with-wallet panel. Connect shows the pubkey; "Sign in"
 * proves ownership to the server (nonce -> sign -> verify) on devnet.
 */
export function WalletPanel() {
  const { publicKey, signMessage, connected } = useWallet();
  const [status, setStatus] = useState<SignInStatus>("idle");
  const [error, setError] = useState("");

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

  return (
    <div className="wallet-panel">
      <WalletMultiButton />
      {connected && status !== "signed" && (
        <button className="wallet-signin" onClick={onSignIn} disabled={status === "signing"}>
          {status === "signing" ? "Signing..." : "Sign in"}
        </button>
      )}
      {status === "signed" && publicKey && (
        <span className="wallet-badge wallet-ok">Signed in {truncateWallet(publicKey.toBase58())}</span>
      )}
      {status === "error" && <span className="wallet-badge wallet-err">{error}</span>}
      <span className="wallet-net">devnet</span>
    </div>
  );
}
