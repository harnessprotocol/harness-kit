import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { MockFsProvider } from "./mock-fs.js";

/**
 * Recursively read a fixture directory tree from disk into a flat
 * { "/project/relative/path": content } map suitable for seeding a
 * MockFsProvider — mirrors a real project/home directory structure without
 * touching the real filesystem at test time.
 */
function readTree(dir: string, baseDir: string, prefix: string): Record<string, string> {
  const files: Record<string, string> = {};
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      Object.assign(files, readTree(fullPath, baseDir, prefix));
    } else {
      const rel = relative(baseDir, fullPath).split(sep).join("/");
      files[`${prefix}/${rel}`] = readFileSync(fullPath, "utf-8");
    }
  }
  return files;
}

/**
 * Build a MockFsProvider whose files are seeded from a fixture directory on
 * disk (packages/core/fixtures/import/<name>/), rooted at cwd = "/project".
 */
export function loadFixtureProject(fixtureDir: string, cwd = "/project", homedir = "/home/user"): MockFsProvider {
  const files = readTree(fixtureDir, fixtureDir, cwd);
  return new MockFsProvider(files, cwd, homedir);
}
