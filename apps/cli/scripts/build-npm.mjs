#!/usr/bin/env node
// Builds the publishable `harness-kit` npm package into apps/cli/npm-dist/.
//
//   node scripts/build-npm.mjs [version]
//
// The version defaults to HK_NPM_VERSION, then apps/cli/package.json.
// Publish from npm-dist/ (never from apps/cli/).
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const cliRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(cliRoot, "..", "..");
const outDir = join(cliRoot, "npm-dist");
const readJson = (p) => JSON.parse(readFileSync(p, "utf-8"));

const cliPkg = readJson(join(cliRoot, "package.json"));
const version = process.argv[2] || process.env.HK_NPM_VERSION || cliPkg.version;
if (!/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/.test(version)) {
  console.error(`'${version}' is not a valid semver string`);
  process.exit(1);
}

rmSync(outDir, { recursive: true, force: true });

const tsup = spawnSync(
  join(cliRoot, "node_modules", ".bin", "tsup"),
  ["--config", "tsup.config.npm.ts"],
  { cwd: cliRoot, stdio: "inherit", env: { ...process.env, HK_NPM_VERSION: version } },
);
if (tsup.status !== 0) process.exit(tsup.status ?? 1);

// Third-party runtime deps of the CLI and the workspace packages it inlines.
// First declaration wins; core is read before exchange so its tighter
// @noble/hashes range (which satisfies both) is kept.
const dependencies = {};
for (const dir of [
  join(cliRoot),
  join(repoRoot, "packages", "core"),
  join(repoRoot, "packages", "exchange"),
  join(repoRoot, "packages", "shared"),
]) {
  for (const [name, range] of Object.entries(readJson(join(dir, "package.json")).dependencies ?? {})) {
    if (name.startsWith("@harness-kit/")) continue;
    dependencies[name] ??= range;
  }
}

const sorted = Object.fromEntries(Object.entries(dependencies).sort(([a], [b]) => a.localeCompare(b)));

const manifest = {
  name: "@harnessprotocol/cli",
  version,
  description: "Compile one harness.yaml into config for Claude Code, Cursor, Codex and other agents, and check it for drift.",
  type: "module",
  bin: { "harness-kit": "dist/index.js", harness: "dist/index.js" },
  files: ["dist", "README.md", "LICENSE"],
  engines: { node: ">=24" },
  license: "Apache-2.0",
  repository: {
    type: "git",
    url: "git+https://github.com/harnessprotocol/harness-kit.git",
    directory: "apps/cli",
  },
  homepage: "https://harnesskit.ai",
  bugs: { url: "https://github.com/harnessprotocol/harness-kit/issues" },
  publishConfig: { access: "public" },
  dependencies: sorted,
};
writeFileSync(join(outDir, "package.json"), JSON.stringify(manifest, null, 2) + "\n");

writeFileSync(
  join(outDir, "README.md"),
  `# harness-kit

Command line tool for [harness-kit](https://github.com/harnessprotocol/harness-kit).
Compile one \`harness.yaml\` into config for Claude Code, Cursor, Codex and other
agents, and check that compiled files match it.

\`\`\`bash
npm install -g @harnessprotocol/cli   # requires Node.js 24+
harness-kit --help

# or run without installing
npx -p @harnessprotocol/cli harness-kit check
\`\`\`

Documentation: https://harnesskit.ai
`,
);

mkdirSync(outDir, { recursive: true });
copyFileSync(join(repoRoot, "LICENSE"), join(outDir, "LICENSE"));
console.log(`Built @harnessprotocol/cli@${version} in ${outDir}`);
