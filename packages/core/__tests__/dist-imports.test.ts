import { readFileSync, statSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const coreRoot = fileURLToPath(new URL("..", import.meta.url));

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
function freshDist(name: string): string | null {
  const artifact = join(coreRoot, "dist", name);
  try {
    const inputs = Math.max(
      newestMtime(join(coreRoot, "src")),
      statSync(join(coreRoot, "tsup.config.ts")).mtimeMs,
    );
    if (statSync(artifact).mtimeMs < inputs) return null;
    return readFileSync(artifact, "utf8");
  } catch {
    return null;
  }
}

/**
 * Guards on the BUILT artifact, not on the source.
 *
 * Vitest runs the suite from source, so both failures this covers are
 * invisible to every other test in the package:
 *
 * 1. A node builtin reaching `dist/index.js`. That entry is what the
 *    desktop's webview loads, and a webview cannot resolve node builtins — a
 *    bare `node:crypto` import in a core module already shipped four broken
 *    routes in a packaged build. Source review does not catch it because the
 *    offending import is legal TypeScript in a file that only the CLI is
 *    supposed to reach; only the bundle shows what actually got pulled in.
 * 2. tsup 8 stripping the `node:` prefix. That default turned `node:sqlite`
 *    into a bare `sqlite` and broke every CLI command. `node:crypto` happens
 *    to survive the rewrite under Node's own resolver, which makes it the
 *    more dangerous case: it stays green here and fails under a bundler that
 *    does not alias bare builtins.
 *
 * Skips rather than fails when dist is stale, so `vitest` alone in a fresh
 * checkout is not a false alarm; CI builds before it tests.
 */
describe("built artifacts", () => {
  it("keeps every node builtin out of the webview-reachable entry", () => {
    const bundle = freshDist("index.js");
    if (bundle === null) return;
    const builtins = [...bundle.matchAll(/(?:from|import\()\s*"(node:[^"]+)"/g)].map((m) => m[1]);
    expect(builtins).toEqual([]);
  });

  it("keeps the node: prefix on builtins in the node entry", () => {
    const bundle = freshDist("node.js");
    if (bundle === null) return;
    // Bare specifiers for things that only exist as builtins — what the
    // `removeNodeProtocol` default produces.
    const bare = [...bundle.matchAll(/(?:from|import\()\s*"([^".][^"]*)"/g)]
      .map((m) => m[1])
      .filter((specifier) =>
        ["crypto", "fs", "fs/promises", "path", "os", "child_process", "sqlite", "util"].includes(
          specifier,
        ),
      );
    expect(bare).toEqual([]);
    expect(bundle).toContain('from "node:crypto"');
  });
});
