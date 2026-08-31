import { execFileSync, spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const cliRoot = fileURLToPath(new URL("..", import.meta.url));
const distEntry = join(cliRoot, "dist", "index.js");

function newestMtime(dir: string): number {
  let newest = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    const mtime = entry.isDirectory() ? newestMtime(path) : statSync(path).mtimeMs;
    if (mtime > newest) newest = mtime;
  }
  return newest;
}

/** dist is current when it exists and is newer than every source/config input. */
function distIsFresh(): boolean {
  try {
    const distMtime = statSync(distEntry).mtimeMs;
    const inputs = Math.max(
      newestMtime(join(cliRoot, "src")),
      statSync(join(cliRoot, "tsup.config.ts")).mtimeMs,
    );
    return distMtime >= inputs;
  } catch {
    return false;
  }
}

/**
 * Bundle-level smoke test. Vitest runs the suite from SOURCE, so a broken
 * dist artifact can ship while every unit test stays green — exactly what
 * happened when tsup 8's `removeNodeProtocol` default rewrote `node:sqlite`
 * to a bare `sqlite` specifier that only exists behind the prefix:
 * ERR_MODULE_NOT_FOUND on every command, --help included. Same failure
 * family as the repo's known node:crypto Tauri production crash. This test
 * ensures dist is fresh and executes it, so that class of regression cannot
 * land silently again.
 */
describe("dist bundle smoke", () => {
  beforeAll(() => {
    // Rebuild only when dist is stale or missing. In CI, turbo's
    // `test dependsOn build` has already produced a fresh bundle —
    // rebuilding here just starves concurrently-running package suites on
    // small runners (observed: admin-console findBy timeouts / fork EPIPE).
    // A bare local `vitest run` against edited sources still rebuilds.
    if (!distIsFresh()) {
      execFileSync("pnpm", ["build"], { cwd: cliRoot, stdio: "pipe", timeout: 120_000 });
    }
  }, 180_000);

  it("keeps node: builtin specifiers intact in the emitted bundle", () => {
    const bundle = readFileSync(distEntry, "utf8");
    // node:sqlite is loaded via dynamic import (lazy, so commands that never
    // touch state don't emit Node's ExperimentalWarning) — a static
    // `from "node:sqlite"` would reintroduce the warning on every command.
    expect(bundle).toMatch(/import\(\s*"node:sqlite"\s*\)/);
    // The regression's signature: the prefix stripped to a bare specifier.
    expect(bundle).not.toMatch(/from\s*"sqlite"/);
    expect(bundle).not.toMatch(/import\(\s*"sqlite"\s*\)/);
  });

  it("--help emits no SQLite ExperimentalWarning on stderr", () => {
    const result = spawnSync(process.execPath, [distEntry, "--help"], {
      encoding: "utf8",
      timeout: 60_000,
    });
    expect(result.status).toBe(0);
    expect(result.stderr).not.toContain("ExperimentalWarning");
  });

  it("executes the built CLI: --help exits 0", () => {
    const stdout = execFileSync(process.execPath, [distEntry, "--help"], {
      encoding: "utf8",
      timeout: 60_000,
    });
    expect(stdout).toContain("harness-kit");
  });
});
