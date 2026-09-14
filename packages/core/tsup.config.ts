import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/node.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  // tsup 8 strips the `node:` prefix by default, which is how `node:sqlite`
  // became a bare `sqlite` specifier and broke every CLI command with
  // ERR_MODULE_NOT_FOUND. `node:crypto` survives the rewrite in Node, so the
  // same bug here would stay invisible until a bundler that does not alias
  // bare builtins loads it. Keep the prefix the source wrote.
  removeNodeProtocol: false,
});
