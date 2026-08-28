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

export interface LockedResource {
  kind: string;
  name: string;
  source: string;
  version?: string;
  revision?: string;
  digest: string;
  alias: string;
}

export interface LockFile {
  version: 1 | 2;
  plugins: LockedPlugin[];
  resources?: LockedResource[];
}

// ── Read / Write ──────────────────────────────────────────────

export function readLockFile(content: string): LockFile {
  const parsed = yamlParse(content) as Record<string, unknown>;

  if (!parsed || typeof parsed !== "object") {
    throw new Error("harness.lock: invalid format — expected a YAML object");
  }
  if (parsed.version !== 1 && parsed.version !== 2) {
    throw new Error(
      `harness.lock: unsupported version ${parsed.version} (expected 1 or 2)`,
    );
  }

  const plugins = Array.isArray(parsed.plugins) ? parsed.plugins : [];

  return {
    version: parsed.version,
    plugins: plugins.map((p: Record<string, unknown>) => ({
      name: String(p.name ?? ""),
      source: String(p.source ?? ""),
      commit: String(p.commit ?? ""),
      contentHash: String(p["content-hash"] ?? p.contentHash ?? ""),
      installedName: String(p["installed-name"] ?? p.installedName ?? p.name ?? ""),
      ...(p.path !== undefined ? { path: String(p.path) } : {}),
    })),
    ...(parsed.version === 2
      ? {
          resources: (Array.isArray(parsed.resources) ? parsed.resources : []).map(
            (r: Record<string, unknown>) => ({
              kind: String(r.kind ?? ""),
              name: String(r.name ?? ""),
              source: String(r.source ?? ""),
              ...(r.version !== undefined ? { version: String(r.version) } : {}),
              ...(r.revision !== undefined ? { revision: String(r.revision) } : {}),
              digest: String(r.digest ?? ""),
              alias: String(r.alias ?? r.name ?? ""),
            }),
          ),
        }
      : {}),
  };
}

export function writeLockFile(lock: LockFile): string {
  const header =
    "# harness.lock — auto-generated, do not edit by hand.\n" +
    "# Commit alongside harness.yaml for reproducible installs.\n";

  const data: Record<string, unknown> = {
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
  if (lock.version === 2) {
    data.resources = (lock.resources ?? []).map((resource) => ({
      kind: resource.kind,
      name: resource.name,
      source: resource.source,
      ...(resource.version ? { version: resource.version } : {}),
      ...(resource.revision ? { revision: resource.revision } : {}),
      digest: resource.digest,
      alias: resource.alias,
    }));
  }

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
  if (plugins.length === 0 && (config.version !== "2" || (config.skills ?? []).length === 0)) return true;

  const lockedNames = new Set(lock.plugins.map((p) => p.name));
  const pluginsFresh = plugins.every((p) => lockedNames.has(p.name));
  if (config.version !== "2") return pluginsFresh;
  const lockedSkills = new Set(
    (lock.resources ?? []).filter((resource) => resource.kind === "skill").map((resource) => resource.name),
  );
  return pluginsFresh && (config.skills ?? []).every((skill) => lockedSkills.has(skill.name));
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
  const missing = plugins
    .filter((p) => !lockedNames.has(p.name))
    .map((p) => p.name);
  if (config.version === "2") {
    const lockedSkills = new Set(
      (lock.resources ?? []).filter((resource) => resource.kind === "skill").map((resource) => resource.name),
    );
    missing.push(...(config.skills ?? []).filter((skill) => !lockedSkills.has(skill.name)).map((skill) => skill.name));
  }
  return missing;
}
