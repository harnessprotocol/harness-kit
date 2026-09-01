import { defineConfig } from "tsup";
import { readFileSync } from "fs";

const pkg = JSON.parse(readFileSync("./package.json", "utf-8"));

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  clean: true,
  sourcemap: true,
  // Match the engines floor (node >=24) instead of tsup's ancient default.
  target: "node24",
  // tsup strips the `node:` prefix from every builtin import by default
  // (removeNodeProtocol: true, a legacy-Node compat shim — this is tsup's
  // own rewrite, not esbuild's). That is harmless for builtins that also
  // resolve bare (`fs/promises`) but FATAL for node:sqlite, which ONLY
  // exists behind the prefix: the emitted bundle imported a bare `sqlite`
  // package that doesn't exist and died with ERR_MODULE_NOT_FOUND on every
  // command, --help included — while the test suite stayed green because
  // vitest runs from source. Guarded by __tests__/dist-smoke.test.ts —
  // keep that test in sync if you touch this.
  removeNodeProtocol: false,
  banner: {
    js: "#!/usr/bin/env node",
  },
  define: {
    __CLI_VERSION__: JSON.stringify(pkg.version),
  },
});
