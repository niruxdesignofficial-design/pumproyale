import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";

// The match engine (physics, minigames, bot AI) lives in the server package and
// is browser-safe; the offline client runs it in-browser via this alias.
const engineDir = fileURLToPath(new URL("../server/src", import.meta.url));

// @solana/web3.js and the wallet adapters expect Node globals (Buffer, process,
// global) in the browser. The polyfill plugin provides them reliably.
export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({ globals: { Buffer: true, global: true, process: true } }),
  ],
  resolve: {
    alias: { "@engine": engineDir },
  },
  server: {
    port: 5173,
    host: true,
  },
  build: {
    target: "es2022",
    sourcemap: true,
  },
});
