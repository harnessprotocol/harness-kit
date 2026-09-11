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
      if (!cancelled) setSnapshot(result);
    }
    load().catch(() => {
      if (!cancelled) setSnapshot(null);
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
      <PortabilityPanel snapshot={snapshot} />
    </div>
  );
}
