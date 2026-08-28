import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/v1": { target: process.env.REGISTRY_URL ?? "http://localhost:4810", changeOrigin: true },
      "/health": { target: process.env.REGISTRY_URL ?? "http://localhost:4810", changeOrigin: true },
    },
  },
  build: { target: "es2022" },
  optimizeDeps: { esbuildOptions: { target: "es2022" } },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
  },
});
