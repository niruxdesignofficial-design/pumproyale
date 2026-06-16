import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The shared workspace package is consumed as TypeScript source, so no extra
// alias is needed: pnpm symlinks it into node_modules and Vite transpiles it.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
  },
  build: {
    target: "es2022",
    sourcemap: true,
  },
});
