import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { truncateWallet } from "../solana/auth";

/**
 * Wallet connect (Phantom/Solflare). Purely cosmetic/optional offline: connecting
 * just shows your address. Play is never gated on a wallet, and no funds move.
 */
export function WalletPanel() {
  const { publicKey, connected } = useWallet();

  return (
    <div className="wallet-panel">
      <WalletMultiButton />
      {connected && publicKey && (
        <span className="wallet-badge wallet-ok">{truncateWallet(publicKey.toBase58())}</span>
      )}
      <span className="wallet-net">devnet</span>
    </div>
  );
}
