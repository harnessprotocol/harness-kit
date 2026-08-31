import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const cliRoot = fileURLToPath(new URL("..", import.meta.url));
const distEntry = join(cliRoot, "dist", "index.js");

/**
 * Bundle-level smoke test. Vitest runs the suite from SOURCE, so a broken
 * dist artifact can ship while every unit test stays green — exactly what
 * happened when tsup's esbuild pass stripped the `node:` prefix off
 * `node:sqlite` (not in its builtin list), leaving the bundle importing a
 * bare `sqlite` package that doesn't exist: ERR_MODULE_NOT_FOUND on every
 * command, --help included. Same failure family as the repo's known
 * node:crypto Tauri production crash. This test rebuilds dist and executes
 * it, so that class of regression cannot land silently again.
 */
describe("dist bundle smoke", () => {
  beforeAll(() => {
    // Always exercise a FRESH bundle, regardless of how the suite was
    // invoked (turbo builds before test in CI; a bare `vitest run` locally
    // would otherwise test a stale or missing dist).
    execFileSync("pnpm", ["build"], { cwd: cliRoot, stdio: "pipe", timeout: 120_000 });
  }, 180_000);

  it("keeps node: builtin specifiers intact in the emitted bundle", () => {
    const bundle = readFileSync(distEntry, "utf8");
    expect(bundle).toContain('from "node:sqlite"');
    // The regression's signature: the prefix stripped to a bare specifier.
    expect(bundle).not.toMatch(/from\s*"sqlite"/);
  });

  it("executes the built CLI: --help exits 0", () => {
    const stdout = execFileSync(process.execPath, [distEntry, "--help"], {
      encoding: "utf8",
      timeout: 60_000,
    });
    expect(stdout).toContain("harness-kit");
  });
});
