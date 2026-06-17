import { useEffect, useRef, useSyncExternalStore } from "react";
import { Game } from "../game/Game";
import { gameStore } from "../game/store";
import { SolanaProviders } from "../solana/SolanaProviders";
import { Hud } from "./Hud";
import { WalletPanel } from "./WalletPanel";
import { Leaderboard } from "./Leaderboard";

/**
 * Root React component. Wraps the app in the Solana wallet context, owns the
 * full-screen canvas, and boots the imperative Three.js game on mount. The game
 * and UI communicate only through gameStore, keeping the 3D engine and the DOM
 * overlay cleanly separated.
 */
export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const state = useSyncExternalStore(gameStore.subscribe, gameStore.getSnapshot);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const game = new Game(canvas);
    void game.start();

    return () => game.dispose();
  }, []);

  return (
    <SolanaProviders>
      <div className="app-root">
        <canvas ref={canvasRef} className="game-canvas" />
        <Hud state={state} />
        <WalletPanel />
        <Leaderboard />
      </div>
    </SolanaProviders>
  );
}
