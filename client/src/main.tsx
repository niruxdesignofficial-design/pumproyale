import { Buffer } from "buffer";
import { createRoot } from "react-dom/client";
import { App } from "./ui/App";
import "./ui/styles.css";

// @solana/web3.js relies on a global Buffer in the browser.
const globalScope = globalThis as unknown as { Buffer?: typeof Buffer };
if (!globalScope.Buffer) globalScope.Buffer = Buffer;

// Note: React StrictMode is intentionally not used here. In development it would
// mount/unmount/remount the App, which creates and tears down two WebGL contexts
// in quick succession. The single imperative game owns one context for its
// lifetime, so we render App directly.
const container = document.getElementById("root");
if (!container) {
  throw new Error("Root element #root not found");
}
createRoot(container).render(<App />);
