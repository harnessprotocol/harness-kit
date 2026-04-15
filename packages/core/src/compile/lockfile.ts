import { stringify as yamlStringify, parse as yamlParse } from "yaml";
import type { HarnessConfig } from "../types.js";

// ── Types ─────────────────────────────────────────────────────

export interface LockedPlugin {
  name: string;
  source: string;
  commit: string;        // exact git commit SHA resolved at sync time
  contentHash: string;  // "sha256:<hex>" of installed skill dir contents
  installedName: string; // may differ from name on flat-layout collision
  path?: string;         // set for local (./path) plugins
}

export interface LockFile {
  version: 1;
  plugins: LockedPlugin[];
}

// ── Read / Write ──────────────────────────────────────────────

export function readLockFile(content: string): LockFile {
  const parsed = yamlParse(content) as Record<string, unknown>;

  if (!parsed || typeof parsed !== "object") {
    throw new Error("harness.lock: invalid format — expected a YAML object");
  }
  if (parsed.version !== 1) {
    throw new Error(
      `harness.lock: unsupported version ${parsed.version} (expected 1)`,
    );
  }

  const plugins = Array.isArray(parsed.plugins) ? parsed.plugins : [];

  return {
    version: 1,
    plugins: plugins.map((p: Record<string, unknown>) => ({
      name: String(p.name ?? ""),
      source: String(p.source ?? ""),
      commit: String(p.commit ?? ""),
      contentHash: String(p["content-hash"] ?? p.contentHash ?? ""),
      installedName: String(p["installed-name"] ?? p.installedName ?? p.name ?? ""),
      ...(p.path !== undefined ? { path: String(p.path) } : {}),
    })),
  };
}

export function writeLockFile(lock: LockFile): string {
  const header =
    "# harness.lock — auto-generated, do not edit by hand.\n" +
    "# Commit alongside harness.yaml for reproducible installs.\n";

  const data = {
    version: lock.version,
    plugins: lock.plugins.map((p) => {
      const entry: Record<string, string> = {
        name: p.name,
        source: p.source,
        commit: p.commit,
        "content-hash": p.contentHash,
        "installed-name": p.installedName,
      };
      if (p.path !== undefined) entry.path = p.path;
      return entry;
    }),
  };

  return header + yamlStringify(data, { lineWidth: 0 });
}

// ── Freshness check ───────────────────────────────────────────

/**
 * Returns true if every plugin declared in config has a matching entry in
 * the lockfile. Does NOT validate content hashes — that's `harness sync --frozen`.
 */
export function isLockFileFresh(
  lock: LockFile,
  config: HarnessConfig,
): boolean {
  const plugins = config.plugins ?? [];
  if (plugins.length === 0) return true;

  const lockedNames = new Set(lock.plugins.map((p) => p.name));
  return plugins.every((p) => lockedNames.has(p.name));
}

/**
 * Find plugins declared in config that are missing from the lockfile.
 */
export function getMissingLockEntries(
  lock: LockFile,
  config: HarnessConfig,
): string[] {
  const plugins = config.plugins ?? [];
  const lockedNames = new Set(lock.plugins.map((p) => p.name));
  return plugins
    .filter((p) => !lockedNames.has(p.name))
    .map((p) => p.name);
}
