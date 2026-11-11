import { defineConfig } from "tsup";
import { readFileSync } from "fs";

const readJson = (p: string) => JSON.parse(readFileSync(p, "utf-8"));
const pkg = readJson("./package.json");
// Release stamping: HK_NPM_VERSION overrides the workspace version.
const version = process.env.HK_NPM_VERSION || pkg.version;

// Third-party dependencies of the CLI and of the workspace packages it inlines.
// They stay external and become `dependencies` of the published package.json
// (see scripts/build-npm.mjs).
const thirdParty = new Set<string>();
for (const dir of [".", "../../packages/core", "../../packages/exchange", "../../packages/shared"]) {
  for (const name of Object.keys(readJson(`${dir}/package.json`).dependencies ?? {})) {
    if (!name.startsWith("@harness-kit/")) thirdParty.add(name);
  }
}

// Bundle for the unscoped `harness-kit` npm package. Inlines only the
// workspace packages (@harness-kit/*), which are not published.
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  outDir: "npm-dist/dist",
  clean: true,
  sourcemap: false,
  target: "node24",
  noExternal: [/^@harness-kit\//],
  external: [...thirdParty].flatMap((n) => [n, new RegExp(`^${n}/`)]),
  // node:sqlite only resolves with the prefix. See tsup.config.ts.
  removeNodeProtocol: false,
  banner: {
    js: "#!/usr/bin/env node",
  },
  define: {
    __CLI_VERSION__: JSON.stringify(version),
  },
});
