import { DriftView } from "../drift/DriftView";
import { DRIFT_FIXTURE_ENTRIES } from "./drift-fixture-data";

/**
 * Dev-only screenshot harness for the Drift screen — renders DriftView with
 * static fixture data so Playwright can capture DESIGN.md §6.3 reference
 * screenshots without a live Tauri/core backend. Not linked from any nav;
 * reachable only by direct URL, and only in dev builds (see App.tsx).
 */
export default function DriftFixture() {
  return (
    <DriftView
      entries={DRIFT_FIXTURE_ENTRIES}
      filteredEntries={DRIFT_FIXTURE_ENTRIES}
      acknowledged={new Set()}
      loading={false}
      error={null}
      harnessFilter={null}
      showAcknowledged={false}
      toasts={[]}
      onToggleShowAcknowledged={() => {}}
      onFixAll={() => {}}
      onFixOne={() => {}}
      onAcknowledge={() => {}}
      onUnacknowledge={() => {}}
      onRescan={() => {}}
      onDismissToast={() => {}}
    />
  );
}
