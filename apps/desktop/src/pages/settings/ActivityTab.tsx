import { Suspense, lazy, useEffect, useState } from "react";
import { homeDir } from "@tauri-apps/api/path";
import { PortabilityPanel } from "../fleet/PortabilityPanel";
import { buildDesktopPortabilitySnapshot, type DesktopPortabilitySnapshot } from "../fleet/portability-data";
import { getCurrentProjectDir } from "../../lib/project-dir";
import { installationId } from "../../lib/installation-id";
import { grantProjectScope } from "../../lib/tauri";

const AuditLogPage = lazy(() => import("../security/AuditLogPage"));

/**
 * Settings › Activity (AC-11, Task 1.7). Combines the audit log
 * (permission/secret/preset events, from the retired standalone Audit Log
 * page) with the portability reconciliation ledger (rollback points,
 * portability notices, device enrollment — from the retired Fleet page)
 * on one tab.
 */
export function ActivityTab() {
  const [snapshot, setSnapshot] = useState<DesktopPortabilitySnapshot | null>(null);
  // Two distinct failure shapes, both previously collapsed into
  // `snapshot === null` — indistinguishable from "still loading" or
  // "nothing to show". `projectDegraded` mirrors MachinePage: a project is
  // tracked but its scope grant failed, so the ledger silently fell back to
  // personal-scope only. `error` is the snapshot build itself throwing.
  const [projectDegraded, setProjectDegraded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const projectDir = getCurrentProjectDir();
      const home = await homeDir();
      // The static FS capability only covers known $HOME config roots, not
      // an arbitrary project dir — grant runtime scope first (mirrors
      // machine-data.ts / drift-data.ts / the retired FleetPage). A failed
      // grant just drops the project layer rather than failing the ledger.
      const scopeReady = projectDir
        ? await grantProjectScope(projectDir).then(
            () => true,
            () => false,
          )
        : false;
      const result = await buildDesktopPortabilitySnapshot(
        home,
        projectDir && scopeReady ? projectDir : null,
        installationId(),
      );
      if (!cancelled) {
        setSnapshot(result);
        setProjectDegraded(Boolean(projectDir) && !scopeReady);
        setError(null);
      }
    }
    load().catch((err) => {
      if (!cancelled) {
        setSnapshot(null);
        setProjectDegraded(false);
        setError(String(err));
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <Suspense fallback={null}>
        <AuditLogPage />
      </Suspense>

      {error && <div className="hk-page-error">Ledger failed to build: {error}</div>}

      {projectDegraded && (
        <div
          data-testid="project-degraded-notice"
          style={{
            padding: "6px 10px",
            borderRadius: 6,
            background: "var(--warning-light)",
            color: "var(--warning)",
            fontSize: 11.5,
          }}
        >
          Project directory could not be scanned — showing personal-scope results only.
        </div>
      )}

      <PortabilityPanel snapshot={snapshot} />
    </div>
  );
}
