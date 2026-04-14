import type { FsProvider } from "../fs-provider.js";

/**
 * Recursively find all SKILL.md files under a directory.
 * Returns absolute paths. Depth-limited to prevent runaway traversal.
 */
export async function findSkillFiles(
  dir: string,
  fs: FsProvider,
  maxDepth = 4,
): Promise<string[]> {
  const results: string[] = [];
  await walk(dir, fs, results, 0, maxDepth);
  return results;
}

async function walk(
  dir: string,
  fs: FsProvider,
  results: string[],
  depth: number,
  maxDepth: number,
): Promise<void> {
  if (depth > maxDepth) return;

  let entries: string[];
  try {
    entries = await fs.readDir(dir);
  } catch {
    return; // Directory doesn't exist or isn't readable
  }

  for (const entry of entries) {
    const fullPath = fs.joinPath(dir, entry);
    if (entry === "SKILL.md") {
      results.push(fullPath);
    } else if (await fs.isDirectory(fullPath)) {
      await walk(fullPath, fs, results, depth + 1, maxDepth);
    }
  }
}

/**
 * Compute the expected source directory for a plugin based on its `source` field.
 * Does not perform any filesystem checks — callers must verify existence.
 *
 * Source formats:
 *   "./path/to/plugin"      — local, relative to cwd
 *   "/absolute/path"        — local, absolute
 *   "owner/repo"            — harness cache: ~/.harness/cache/owner/repo
 *   "github.com/owner/repo" — harness cache: ~/.harness/cache/owner/repo
 */
export function computeSourceDir(
  source: string,
  cwd: string,
  home: string,
  joinPath: (...segments: string[]) => string,
): string | null {
  if (!source) return null;

  if (source.startsWith("./") || source.startsWith("../")) {
    // Strip leading ./ so posixJoin doesn't produce un-normalized paths like /cwd/./sub
    const rel = source.startsWith("./") ? source.slice(2) : source;
    return joinPath(cwd, rel);
  }
  if (source.startsWith("/")) {
    return source;
  }

  // Remote / registry → check harness cache
  const cacheKey = source.startsWith("github.com/")
    ? source.slice("github.com/".length)
    : source;
  return joinPath(home, ".harness", "cache", cacheKey);
}
