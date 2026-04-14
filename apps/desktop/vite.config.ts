import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1422,
    strictPort: true,
    watch: {
      // 3. tell vite to ignore watching `src-tauri` and worktree artifacts
      ignored: ["**/src-tauri/**", "**/.auto-claude/**"],
    },
  },

  build: {
    rollupOptions: {
      // node:crypto is used by @harness-kit/core's compile/check utilities (Node.js-only).
      // Those functions are never called from the desktop app. Mark as external so
      // Rollup doesn't attempt to bundle it for the browser.
      external: ["node:crypto"],
    },
  },

  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "e2e/**"],
    coverage: {
      provider: "v8",
      include: ["src/pages/marketplace/**", "src/lib/markdown.ts", "src/lib/supabase.ts"],
    },
  },
}));
