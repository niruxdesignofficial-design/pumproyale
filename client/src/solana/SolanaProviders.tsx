import { useMemo, type ReactNode } from "react";
import { clusterApiUrl } from "@solana/web3.js";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import "@solana/wallet-adapter-react-ui/styles.css";

/**
 * Wraps the app in the Solana wallet-adapter context (devnet by default).
 * Phantom, Solflare, and any other Wallet Standard wallet are auto-detected, so
 * the explicit wallet list can stay empty.
 */
export function SolanaProviders({ children }: { children: ReactNode }) {
  const endpoint = useMemo(() => {
    const fromEnv = import.meta.env.VITE_SOLANA_RPC;
    return typeof fromEnv === "string" && fromEnv.length > 0 ? fromEnv : clusterApiUrl("devnet");
  }, []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={[]} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
