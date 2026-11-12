import { homeDir } from "@tauri-apps/api/path";
import {
  parseHarness,
  validateHarness,
  detectDrift,
  type DriftItem,
  type HarnessConfig,
  type FsProvider,
} from "@harness-kit/core";
import { TauriFsProvider } from "../../lib/harness-fs";
import { grantProjectDir, projectDirLabel } from "../../lib/project-dir";
import { errorDetails } from "../../lib/error-details";

export interface DriftScope {
  kind: "global" | "project";
  root: string;
  label: string;
  fs: FsProvider;
}

export interface ScopedDriftItem {
  scope: DriftScope;
  item: DriftItem;
}

/** Stable composite key for one DriftItem within one scope — matches the Rust
 *  drift_acknowledgements table's primary key (see commands/parity.rs). */
export function driftItemKey(scope: DriftScope, item: DriftItem): string {
  return [scope.root, item.adapter, item.path, item.harnessName, item.slot].join("::");
}

/** What Drift reports to an embedding page after it has scanned. */
export interface DriftSummary {
  /**
   * Unacknowledged drift items per adapter id, the values `harness=` takes,
   * so the embedding page can count what the list shows under any filter
   * without Drift scanning again.
   */
  byHarness: Record<string, number>;
  /** Every unacknowledged item: the count with no `harness=` filter. */
  total: number;
}

/** Count the entries the list shows by default (acknowledged ones are hidden), per adapter. */
export function summarizeDrift(entries: ScopedDriftItem[], acknowledged: ReadonlySet<string>): DriftSummary {
  const byHarness: Record<string, number> = {};
  let total = 0;
  for (const entry of entries) {
    if (acknowledged.has(driftItemKey(entry.scope, entry.item))) continue;
    byHarness[entry.item.adapter] = (byHarness[entry.item.adapter] ?? 0) + 1;
    total += 1;
  }
  return { byHarness, total };
}

/**
 * The harness.yaml a scope is compared against (AC-55): Global is the personal
 * profile at `~/.claude/harness.yaml`, the same file Profile, Compile and
 * onboarding use; a project is its own committed `harness.yaml`, the team
 * baseline. Never `~/harness.yaml`.
 */
export function scopeHarnessPath(scope: DriftScope): string {
  return scope.kind === "global"
    ? scope.fs.joinPath(scope.root, ".claude", "harness.yaml")
    : scope.fs.joinPath(scope.root, "harness.yaml");
}

/**
 * What Drift knows about one scope's harness.yaml. `no-file` and `unreadable`
 * are different facts (nothing to compare against vs. a file we could not
 * use); `never-compiled` and `clean` both have a usable file.
 */
export type ScopeState = "no-file" | "unreadable" | "never-compiled" | "clean" | "drifted";

export interface ScopeStatus {
  scope: DriftScope;
  state: ScopeState;
  /** Absolute path of the harness.yaml this scope reads. */
  path: string;
  /** Why the file could not be read (`unreadable` only). */
  detail?: string;
}

type ScopeFile =
  | { state: "no-file" }
  | { state: "unreadable"; detail: string }
  | { state: "ok"; config: HarnessConfig };

async function loadScopeFile(scope: DriftScope): Promise<ScopeFile> {
  const path = scopeHarnessPath(scope);
  if (!(await scope.fs.exists(path))) return { state: "no-file" };
  let yamlString: string;
  try {
    yamlString = await scope.fs.readFile(path);
  } catch (err) {
    return { state: "unreadable", detail: errorDetails(err) };
  }
  try {
    const { config } = parseHarness(yamlString);
    const validation = validateHarness(config);
    if (!validation.valid) {
      const first = validation.errors[0];
      return { state: "unreadable", detail: first ? `${first.path}: ${first.message}` : "not a valid harness.yaml" };
    }
    return { state: "ok", config };
  } catch (err) {
    return { state: "unreadable", detail: errorDetails(err) };
  }
}

/** Build the list of scopes Drift honestly has: Global + `projectDir`, the
 *  title bar's current project (lib/project-dir.ts), if any. There is no
 *  tracked-projects registry yet. */
export async function buildDriftScopes(projectDir: string | null): Promise<DriftScope[]> {
  const home = await homeDir();
  const scopes: DriftScope[] = [
    { kind: "global", root: home, label: "Global", fs: new TauriFsProvider(home) },
  ];
  if (projectDir) {
    // Static capability scope only covers known harness config roots under
    // $HOME — grant runtime access to this arbitrary project dir before
    // scanning it. A stale/deleted dir just drops the project scope rather
    // than failing the whole Drift scan.
    const granted = await grantProjectDir(projectDir);
    if (granted) {
      scopes.push({
        kind: "project",
        root: projectDir,
        label: projectDirLabel(projectDir),
        fs: new TauriFsProvider(projectDir),
      });
    }
  }
  return scopes;
}

/** Run detectDrift() for every scope that has a valid harness.yaml, flattened
 *  into (scope, item) tuples. A scope with no usable harness.yaml yields no
 *  items here; `describeScopes` says why, so the page never reports "no drift"
 *  for a scope it could not compare. */
export async function collectDrift(scopes: DriftScope[]): Promise<ScopedDriftItem[]> {
  const results: ScopedDriftItem[] = [];
  for (const scope of scopes) {
    const file = await loadScopeFile(scope);
    if (file.state !== "ok") continue;
    const homeRoot = await scope.fs.homedir();
    const report = await detectDrift(file.config, { fs: scope.fs, projectRoot: scope.fs.cwd(), homeRoot });
    for (const item of report.items) {
      results.push({ scope, item });
    }
  }
  return results;
}

/**
 * One status per scope (AC-55), given what `collectDrift` found. "Never
 * compiled" is a file with at least one drift item where every item is
 * `missing`: nothing the file describes has been deployed yet. Any other mix
 * is drift.
 */
export async function describeScopes(scopes: DriftScope[], entries: ScopedDriftItem[]): Promise<ScopeStatus[]> {
  const statuses: ScopeStatus[] = [];
  for (const scope of scopes) {
    const path = scopeHarnessPath(scope);
    const file = await loadScopeFile(scope);
    if (file.state === "no-file") {
      statuses.push({ scope, state: "no-file", path });
    } else if (file.state === "unreadable") {
      statuses.push({ scope, state: "unreadable", path, detail: file.detail });
    } else {
      const own = entries.filter((e) => e.scope.kind === scope.kind && e.scope.root === scope.root);
      const state: ScopeState =
        own.length === 0 ? "clean" : own.every((e) => e.item.class === "missing") ? "never-compiled" : "drifted";
      statuses.push({ scope, state, path });
    }
  }
  return statuses;
}
