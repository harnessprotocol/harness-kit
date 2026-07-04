import { FleetView } from "../fleet/FleetView";
import { FLEET_FIXTURE_REPORT, FLEET_FIXTURE_HARNESSES } from "./fleet-fixture-data";

/**
 * Dev-only screenshot harness for the Fleet screen — renders FleetView with
 * static fixture data so Playwright can capture DESIGN.md §6.3 reference
 * screenshots without a live Tauri/core backend. Not linked from any nav;
 * reachable only by direct URL, and only in dev builds (see App.tsx).
 */
export default function FleetFixture() {
  return (
    <FleetView
      report={FLEET_FIXTURE_REPORT}
      harnesses={FLEET_FIXTURE_HARNESSES}
      loading={false}
      recompiling={false}
      error={null}
      lastCompiled={new Date(Date.now() - 12 * 60_000).toISOString()}
      projectTracked
      onRecompileAll={() => {}}
      onScan={() => {}}
      onNavigateToConfigure={() => {}}
      onNavigateToDrift={() => {}}
    />
  );
}
