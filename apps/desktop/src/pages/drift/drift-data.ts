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
import { getCurrentProjectDir, projectDirLabel } from "../../lib/project-dir";
import { grantProjectScope } from "../../lib/tauri";

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

async function readScopeConfig(fs: FsProvider): Promise<HarnessConfig | null> {
  const path = fs.joinPath(fs.cwd(), "harness.yaml");
  let yamlString: string;
  try {
    yamlString = await fs.readFile(path);
  } catch {
    return null;
  }
  try {
    const { config } = parseHarness(yamlString);
    const validation = validateHarness(config);
    if (!validation.valid) return null;
    return config;
  } catch {
    return null;
  }
}

/** Build the list of scopes Drift honestly has: Global + the currently open
 *  project, if any. There is no tracked-projects registry yet. */
export async function buildDriftScopes(): Promise<DriftScope[]> {
  const home = await homeDir();
  const projectDir = getCurrentProjectDir();
  const scopes: DriftScope[] = [
    { kind: "global", root: home, label: "Global", fs: new TauriFsProvider(home) },
  ];
  if (projectDir) {
    // Static capability scope only covers known harness config roots under
    // $HOME — grant runtime access to this arbitrary project dir before
    // scanning it. A stale/deleted dir just drops the project scope rather
    // than failing the whole Drift scan.
    const granted = await grantProjectScope(projectDir).then(
      () => true,
      () => false,
    );
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
 *  into (scope, item) tuples. Scopes with no usable harness.yaml are skipped
 *  silently — nothing to compare drift against. */
export async function collectDrift(scopes: DriftScope[]): Promise<ScopedDriftItem[]> {
  const results: ScopedDriftItem[] = [];
  for (const scope of scopes) {
    const config = await readScopeConfig(scope.fs);
    if (!config) continue;
    const homeRoot = await scope.fs.homedir();
    const report = await detectDrift(config, { fs: scope.fs, projectRoot: scope.fs.cwd(), homeRoot });
    for (const item of report.items) {
      results.push({ scope, item });
    }
  }
  return results;
}
