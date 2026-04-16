import { defineConfig } from "tsup";
import { readFileSync } from "fs";

const pkg = JSON.parse(readFileSync("./package.json", "utf-8"));

export default defineConfig({
  entry: { "harness-kit-standalone": "src/index.ts" },
  format: ["esm"],
  clean: false,
  sourcemap: false,
  noExternal: [/.*/],
  banner: {
    js: "#!/usr/bin/env node",
  },
  define: {
    __CLI_VERSION__: JSON.stringify(pkg.version),
  },
});
