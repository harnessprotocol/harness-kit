import { Suspense, lazy, useEffect, useState } from "react";
import { homeDir } from "@tauri-apps/api/path";
import { PortabilityPanel } from "../fleet/PortabilityPanel";
import { RegistryEnrollment } from "../fleet/RegistryEnrollment";
import { getLedgerLab } from "../../lib/preferences";
import { buildDesktopPortabilitySnapshot, type DesktopPortabilitySnapshot } from "../fleet/portability-data";
import { getCurrentProjectDir } from "../../lib/project-dir";
import { installationId } from "../../lib/installation-id";
import { grantProjectScope } from "../../lib/tauri";
import { errorDetails } from "../../lib/error-details";
import { ErrorNotice } from "@harness-kit/ui";
import { ChangesList } from "./ChangesList";

const AuditLogPage = lazy(() => import("../security/AuditLogPage"));

/**
 * Settings › Activity (AC-11, Task 1.7). One tab for three things: the
 * Changes list (what the app changed, with Undo), the audit log (permission,
 * secret, preset and Machine copy events), and device enrollment. The
 * reconciliation ledger (layers, conflicts, rollback points) is a Labs view.
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
  // Bumped by the notice's Retry to build the snapshot again.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const projectDir = getCurrentProjectDir();
      const home = await homeDir();
      // The static FS capability only covers known $HOME config roots, not
      // an arbitrary project dir — grant runtime scope first (as
      // machine-data.ts and drift-data.ts do). A failed
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
        setError(errorDetails(err));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <ChangesList />

      <Suspense fallback={null}>
        <AuditLogPage />
      </Suspense>

      {error && (
        <ErrorNotice
          title="Couldn't read this device's state"
          details={error}
          action={{ label: "Retry", onClick: () => setAttempt((n) => n + 1) }}
        />
      )}

      {projectDegraded && (
        <div
          data-testid="project-degraded-notice"
          style={{
            padding: "6px 10px",
            borderRadius: 6,
            background: "var(--warning-light)",
            color: "var(--warning-text)",
            fontSize: 11.5,
          }}
        >
          Project directory could not be scanned — showing personal-scope results only.
        </div>
      )}

      {getLedgerLab() ? (
        <PortabilityPanel snapshot={snapshot} />
      ) : (
        snapshot && (
          <section className="hk-portability" aria-labelledby="enrollment-heading">
            <div className="hk-portability-head">
              <h2 id="enrollment-heading">Device enrollment</h2>
            </div>
            <div className="hk-portability-body">
              <RegistryEnrollment inventory={snapshot.inventory} />
            </div>
          </section>
        )
      )}
    </div>
  );
}
