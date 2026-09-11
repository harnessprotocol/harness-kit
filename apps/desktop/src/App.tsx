import { lazy, Suspense, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import AppLayout from "./layouts/AppLayout";
import { getDefaultSection, getWelcomeSeen, setWelcomeSeen } from "./lib/preferences";
import { ObservatoryProvider } from "./hooks/useObservatoryData";
import { DriftRedirect } from "./routes/DriftRedirect";
import { FleetRedirect } from "./routes/FleetRedirect";

// Lazy-load all pages so the initial bundle only includes the shell + router
const PreferencesPage = lazy(() => import("./pages/PreferencesPage"));
const OnboardingPage = lazy(() => import("./pages/onboarding/OnboardingPage"));
const HarnessFilePage = lazy(() => import("./pages/harness/HarnessFilePage"));
const PluginsPage = lazy(() => import("./pages/harness/PluginsPage"));
const HooksPage = lazy(() => import("./pages/harness/HooksPage"));
const McpServersPage = lazy(() => import("./pages/harness/McpServersPage"));
const PluginExplorerPage = lazy(() => import("./pages/harness/PluginExplorerPage"));
const ClaudeMdPage = lazy(() => import("./pages/harness/ClaudeMdPage"));
const ConfigFilePage = lazy(() => import("./pages/harness/ConfigFilePage"));
const SyncPage = lazy(() => import("./pages/harness/SyncPage"));
const MarketplacePage = lazy(() => import("./pages/marketplace/MarketplacePage"));
const DashboardPage = lazy(() => import("./pages/observatory/DashboardPage"));
const SessionsPage = lazy(() => import("./pages/observatory/SessionsPage"));
const ComparatorPage = lazy(() => import("./pages/comparator/ComparatorPage"));
const PermissionsPage = lazy(() => import("./pages/security/PermissionsPage"));
const MachinePage = lazy(() => import("./pages/machine/MachinePage"));

// Dev-only screenshot fixtures (DESIGN.md §8 verification) — render Machine/Drift/
// Onboarding's presentational views with static data, no Tauri/core backend
// required. Not linked from any nav; only mounted below when import.meta.env.DEV is true.
const MachineFixture = lazy(() => import("./pages/__fixtures__/MachineFixture"));
const DriftFixture = lazy(() => import("./pages/__fixtures__/DriftFixture"));
const OnboardingFixture = lazy(() => import("./pages/__fixtures__/OnboardingFixture"));

function DefaultRedirect() {
  const defaultSection = getDefaultSection();
  return <Navigate to={defaultSection} replace />;
}

// Dev mode: show branch + launch time in title bar to distinguish multiple instances
if (import.meta.env.DEV) {
  const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  fetch("http://localhost:1422/__tauri_cli__")
    .catch(() => null); // ignore — just prevents console noise
  import("@tauri-apps/plugin-shell").then(({ Command }) => {
    Command.create("git", ["branch", "--show-current"])
      .execute()
      .then((out) => {
        const branch = out.stdout.trim() || "detached";
        document.title = `Harness Kit — ${branch} — ${time}`;
      })
      .catch(() => {
        document.title = `Harness Kit — dev — ${time}`;
      });
  });
}

export default function App() {
  const [showWelcome, setShowWelcome] = useState(() => !getWelcomeSeen());

  return (
    <>
      <ObservatoryProvider>
        {showWelcome && (
          <Suspense fallback={null}>
            <OnboardingPage
              onFinish={() => {
                setWelcomeSeen();
                setShowWelcome(false);
              }}
            />
          </Suspense>
        )}
        <BrowserRouter>
          <Routes>
            {import.meta.env.DEV && (
              <>
                <Route path="__fixtures__/machine" element={<MachineFixture />} />
                <Route path="__fixtures__/drift" element={<DriftFixture />} />
                <Route path="__fixtures__/onboarding" element={<OnboardingFixture />} />
              </>
            )}
            <Route path="/" element={<AppLayout />}>
            {/* Machine — home (default section; user-overridable in preferences) */}
            <Route index element={<DefaultRedirect />} />
            <Route path="machine" element={<MachinePage />} />
            {/* Retired route — Fleet itself is retired in Task 1.6; this just
                closes the direct-URL path (AC-6). */}
            <Route path="fleet" element={<FleetRedirect />} />

            {/* Harness Manager */}
            <Route path="harness/file" element={<HarnessFilePage />} />
            <Route path="harness/plugins" element={<PluginsPage />} />
            <Route path="harness/plugins/:pluginName" element={<PluginExplorerPage />} />
            <Route path="harness/mcp" element={<McpServersPage />} />
            <Route path="harness/hooks" element={<HooksPage />} />
            <Route path="harness/claude-md" element={<ClaudeMdPage />} />
            <Route path="harness/sync" element={<SyncPage />} />
            {/* Retired route (AC-41) */}
            <Route path="harness/settings" element={<Navigate to="/harness/file" replace />} />
            <Route path="harness/config/:filename" element={<ConfigFilePage />} />
            {/* Permissions — now under the Claude Code nav group (AC-10) */}
            <Route path="harness/permissions" element={<PermissionsPage />} />

            {/* Marketplace */}
            <Route path="marketplace/:slug?" element={<MarketplacePage />} />
            <Route path="observatory" element={<DashboardPage />} />
            <Route path="observatory/sessions" element={<SessionsPage />} />

            {/* Retired route */}
            <Route path="agents" element={<Navigate to="/machine" replace />} />

            {/* Comparator */}
            <Route path="comparator" element={<ComparatorPage />} />

            {/* Security — retired routes (AC-10); Permissions moved under
                Claude Code, Secrets/Activity moved under Settings. */}
            <Route path="security/permissions" element={<Navigate to="/harness/permissions" replace />} />
            <Route path="security/secrets" element={<Navigate to="/preferences/secrets" replace />} />
            <Route path="security/audit" element={<Navigate to="/preferences/activity" replace />} />

            {/* Drift */}
            {/* AC-37: Drift is presented inside the Machine view; the legacy
                route redirects rather than 404ing anyone's bookmark. */}
            <Route path="drift" element={<DriftRedirect />} />

            {/* Preferences / Settings (Security folds in here as tabs — DESIGN.md §5) */}
            <Route path="preferences" element={<PreferencesPage />} />
            <Route path="preferences/:tab" element={<PreferencesPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ObservatoryProvider>
    </>
  );
}
