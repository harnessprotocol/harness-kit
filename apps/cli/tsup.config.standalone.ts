import { defineConfig } from "tsup";
import { readFileSync } from "fs";

const pkg = JSON.parse(readFileSync("./package.json", "utf-8"));

export default defineConfig({
  entry: { "harness-kit-standalone": "src/index.ts" },
  format: ["cjs"],
  clean: false,
  sourcemap: false,
  noExternal: [/.*/],
  target: "node24",
  // Keep `node:` prefixes: node:sqlite only resolves with the prefix.
  // See tsup.config.ts for the full story.
  removeNodeProtocol: false,
  banner: {
    js: "#!/usr/bin/env node",
  },
  define: {
    __CLI_VERSION__: JSON.stringify(pkg.version),
  },
});
