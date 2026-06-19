import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Game } from "../game/Game";
import { gameStore } from "../game/store";
import { preloadCharacters } from "../game/characterModel";
import { SolanaProviders } from "../solana/SolanaProviders";
import { Hud } from "./Hud";
import { Menu } from "./Menu";
import { CharacterSelect } from "./CharacterSelect";
import { SocialLink } from "./SocialLink";

type Screen = "menu" | "select" | "playing";

/**
 * Root component and screen state machine: menu -> character select -> playing.
 * The Three.js game mounts only while playing; a match key lets "Play again"
 * remount a fresh PumpDash match. The whole tree is wrapped in the Solana context.
 */
export function App() {
  const [screen, setScreen] = useState<Screen>("menu");
  const [matchKey, setMatchKey] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const state = useSyncExternalStore(gameStore.subscribe, gameStore.getSnapshot);

  // Warm the character models up front so previews and the match are instant.
  useEffect(() => {
    void preloadCharacters();
  }, []);

  // Boot the imperative game while on the playing screen; remount on matchKey.
  useEffect(() => {
    if (screen !== "playing") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const game = new Game(canvas);
    void game.start();
    return () => game.dispose();
  }, [screen, matchKey]);

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
            <Hud
              state={state}
              onExit={() => setScreen("menu")}
              onPlayAgain={() => setMatchKey((k) => k + 1)}
            />
          </>
        )}
        <SocialLink />
      </div>
    </SolanaProviders>
  );
}
