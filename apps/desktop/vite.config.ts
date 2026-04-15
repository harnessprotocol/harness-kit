import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// node:crypto is used by @harness-kit/core's Node.js-only compile/check utilities.
// The desktop never calls these functions; externalize so Vite doesn't try to bundle
// it for the browser and fail with __vite-browser-external.
const externalNodeModules = {
  name: "external-node-builtins",
  enforce: "pre" as const,
  resolveId(id: string) {
    // TypeScript may emit "node:crypto" or "crypto" depending on target/module settings.
    if (id === "node:crypto" || id === "crypto") return { id, external: true };
  },
};

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  plugins: [externalNodeModules, react(), tailwindcss()],

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
