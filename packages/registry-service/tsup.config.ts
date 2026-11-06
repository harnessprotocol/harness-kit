import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts", server: "src/bin/server.ts", migrate: "src/bin/migrate.ts" },
  dts: { entry: "src/index.ts" },
  format: ["esm"],
  target: "node22",
  clean: true,
  sourcemap: true,
});
