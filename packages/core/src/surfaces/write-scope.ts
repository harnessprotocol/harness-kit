import type { TransactionRoot } from "../portability/transaction.js";
import { SURFACES } from "./registry.js";
import type { ConfigStore, PlatformPathOverrides } from "./types.js";

type Platform = keyof PlatformPathOverrides;

/**
 * The set of home-relative paths HarnessKit may write, derived from the
 * surface registry's user-scope config stores.
 *
 * This is what bounds a user-scope apply: the blast radius is exactly the
 * files M1 already knows how to read, and it moves with the descriptors
 * rather than with code (AC-31).
 */
export interface HomeWriteScope {
  /** Exact home-relative paths of single-file stores. */
  files: ReadonlySet<string>;
  /** Home-relative directory stores; anything beneath one is writable. */
  directories: readonly string[];
}

/** A store whose path names a directory of files rather than one file. */
function isDirectoryStore(store: ConfigStore): boolean {
  return store.formatId === "skills-dir" || store.shape?.directory === true;
}

function normalize(path: string): string {
  const slashed = path.replace(/\\/g, "/");
  // Trailing slashes are trimmed by slicing rather than /\/+$/, which is
  // polynomial-backtracking on a long run of slashes (CodeQL
  // js/polynomial-redos) — and this runs on caller-supplied paths.
  let end = slashed.length;
  while (end > 0 && slashed[end - 1] === "/") end -= 1;
  return slashed.slice(0, end);
}

/** Build the write scope for a platform from every surface's user-scope stores. */
export function homeWriteScope(platform: Platform): HomeWriteScope {
  const files = new Set<string>();
  const directories = new Set<string>();
  for (const surface of SURFACES) {
    for (const store of surface.stores) {
      if (store.scope !== "user") continue;
      const path = normalize(store.pathByPlatform?.[platform] ?? store.path);
      if (path.length === 0) continue;
      if (isDirectoryStore(store)) directories.add(path);
      else files.add(path);
    }
  }
  return { files, directories: [...directories].sort() };
}

/**
 * Whether a home-relative path may be written.
 *
 * Matching is path-segment aware in both directions: `.claude.json.bak` is not
 * `.claude.json`, and `.claude/skillsets/x` is not inside `.claude/skills`.
 */
export function isWritableHomePath(path: string, scope: HomeWriteScope): boolean {
  const candidate = normalize(path);
  if (candidate.length === 0) return false;
  // Traversal and absolute forms are the transaction guard's job too, but a
  // scope check that quietly returned true for them would be a trap.
  if (candidate.startsWith("/") || candidate.startsWith("~")) return false;
  if (candidate.split("/").some((segment) => segment === "..")) return false;

  if (scope.files.has(candidate)) return true;
  return scope.directories.some((directory) => candidate.startsWith(`${directory}/`));
}

/**
 * A `home` transaction root bounded to the registry's declared user-scope
 * stores. Pass to `applyFileTransaction` as `roots.home`.
 */
export function createHomeTransactionRoot(
  absolutePath: string,
  platform: Platform,
): TransactionRoot {
  const scope = homeWriteScope(platform);
  return {
    absolutePath,
    allowPath: (path) => isWritableHomePath(path, scope),
  };
}
