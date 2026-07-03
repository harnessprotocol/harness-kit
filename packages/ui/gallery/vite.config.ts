import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 4900 },
  // Dev/screenshot-only tooling — target esnext so esbuild's dependency
  // pre-bundling doesn't attempt (and fail on) downlevel transforms of
  // modern destructuring syntax shipped by some deps (e.g. lucide-react).
  optimizeDeps: {
    esbuildOptions: { target: "esnext" },
  },
  build: {
    target: "esnext",
  },
});
