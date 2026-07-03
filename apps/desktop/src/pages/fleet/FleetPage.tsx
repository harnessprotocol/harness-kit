import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { homeDir } from "@tauri-apps/api/path";
import { buildFleetReport } from "@harness-kit/core";
import type { FleetReport } from "@harness-kit/core";
import type { HarnessInfo } from "@harness-kit/shared";
import { TauriFsProvider } from "../../lib/harness-fs";
import { detectHarnesses, grantProjectScope } from "../../lib/tauri";
import { getCurrentProjectDir, projectDirLabel } from "../../lib/project-dir";
import { FleetView } from "./FleetView";

const LAST_COMPILED_KEY = "harness-kit-last-compiled-at";

export default function FleetPage() {
  const navigate = useNavigate();
  const [report, setReport] = useState<FleetReport | null>(null);
  const [harnesses, setHarnesses] = useState<HarnessInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [recompiling, setRecompiling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastCompiled, setLastCompiled] = useState<string | null>(
    () => localStorage.getItem(LAST_COMPILED_KEY),
  );
  const [projectScopeReady, setProjectScopeReady] = useState(false);
  const projectDir = getCurrentProjectDir();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [home, harnessData] = await Promise.all([homeDir(), detectHarnesses()]);
      // Grant runtime FS scope for the project dir before touching it — the
      // static capability only lists known harness config roots under $HOME,
      // not the project dir. A stale/deleted project dir shouldn't take down
      // the whole report, so just drop it from the scan on failure.
      const scopeReady = projectDir
        ? await grantProjectScope(projectDir).then(
            () => true,
            () => false,
          )
        : false;
      setProjectScopeReady(scopeReady);
      const scopes = [
        { kind: "global" as const, label: "Global", fs: new TauriFsProvider(home) },
        ...(projectDir && scopeReady
          ? [{ kind: "project" as const, label: projectDirLabel(projectDir), fs: new TauriFsProvider(projectDir) }]
          : []),
      ];
      const fleetReport = await buildFleetReport({ scopes });
      setReport(fleetReport);
      setHarnesses(harnessData);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [projectDir]);

  useEffect(() => {
    load();
  }, [load]);

  const handleRecompileAll = useCallback(async () => {
    setRecompiling(true);
    try {
      // Re-scan is the honest "recompile all" until a write-back compile flow
      // is wired into Fleet (compile itself lives on the harness.yaml/Sync
      // pages) — this refreshes every cell's detected state immediately.
      await load();
      const now = new Date().toISOString();
      localStorage.setItem(LAST_COMPILED_KEY, now);
      setLastCompiled(now);
    } finally {
      setRecompiling(false);
    }
  }, [load]);

  return (
    <FleetView
      report={report}
      harnesses={harnesses}
      loading={loading}
      recompiling={recompiling}
      error={error}
      lastCompiled={lastCompiled}
      projectTracked={Boolean(projectDir) && projectScopeReady}
      onRecompileAll={handleRecompileAll}
      onScan={load}
      onNavigateToConfigure={(scopeRoot) => navigate(`/harness/file?scope=${encodeURIComponent(scopeRoot)}`)}
      onNavigateToDrift={(adapterId) => navigate(`/drift?harness=${encodeURIComponent(adapterId)}`)}
    />
  );
}
