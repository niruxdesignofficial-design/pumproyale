import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Game } from "../game/Game";
import { gameStore } from "../game/store";
import { preloadCharacters } from "../game/characterModel";
import { SolanaProviders } from "../solana/SolanaProviders";
import { Hud } from "./Hud";
import { Menu } from "./Menu";
import { CharacterSelect } from "./CharacterSelect";

type Screen = "menu" | "select" | "playing";

/**
 * Root component and screen state machine: menu -> character select -> playing.
 * The Three.js game mounts only while playing; menu/select are pure React. The
 * whole tree is wrapped in the Solana wallet context.
 */
export function App() {
  const [screen, setScreen] = useState<Screen>("menu");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const state = useSyncExternalStore(gameStore.subscribe, gameStore.getSnapshot);

  // Warm the character models up front so previews and the match are instant.
  useEffect(() => {
    void preloadCharacters();
  }, []);

  // Boot the imperative game only while on the playing screen.
  useEffect(() => {
    if (screen !== "playing") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const game = new Game(canvas);
    void game.start();
    return () => game.dispose();
  }, [screen]);

  return (
    <SolanaProviders>
      <div className="app-root">
        {screen === "menu" && <Menu onPlay={() => setScreen("select")} />}
        {screen === "select" && (
          <CharacterSelect
            onConfirm={() => setScreen("playing")}
            onBack={() => setScreen("menu")}
          />
        )}
        {screen === "playing" && (
          <>
            <canvas ref={canvasRef} className="game-canvas" />
            <Hud state={state} onExit={() => setScreen("menu")} />
          </>
        )}
      </div>
    </SolanaProviders>
  );
}
