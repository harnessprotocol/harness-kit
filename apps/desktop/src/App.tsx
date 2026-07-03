import { lazy, Suspense, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import AppLayout from "./layouts/AppLayout";
import { getDefaultSection, getWelcomeSeen, setWelcomeSeen } from "./lib/preferences";
import { ObservatoryProvider } from "./hooks/useObservatoryData";

// Lazy-load all pages so the initial bundle only includes the shell + router
const PreferencesPage = lazy(() => import("./pages/PreferencesPage"));
const WelcomeScreen = lazy(() => import("./components/WelcomeScreen"));
const HarnessFilePage = lazy(() => import("./pages/harness/HarnessFilePage"));
const PluginsPage = lazy(() => import("./pages/harness/PluginsPage"));
const HooksPage = lazy(() => import("./pages/harness/HooksPage"));
const McpServersPage = lazy(() => import("./pages/harness/McpServersPage"));
const SettingsPage = lazy(() => import("./pages/harness/SettingsPage"));
const PluginExplorerPage = lazy(() => import("./pages/harness/PluginExplorerPage"));
const ClaudeMdPage = lazy(() => import("./pages/harness/ClaudeMdPage"));
const ConfigFilePage = lazy(() => import("./pages/harness/ConfigFilePage"));
const SyncPage = lazy(() => import("./pages/harness/SyncPage"));
const MarketplacePage = lazy(() => import("./pages/marketplace/MarketplacePage"));
const DashboardPage = lazy(() => import("./pages/observatory/DashboardPage"));
const SessionsPage = lazy(() => import("./pages/observatory/SessionsPage"));
const ComparatorPage = lazy(() => import("./pages/comparator/ComparatorPage"));
const PermissionsPage = lazy(() => import("./pages/security/PermissionsPage"));
const SecretsPage = lazy(() => import("./pages/security/SecretsPage"));
const AuditLogPage = lazy(() => import("./pages/security/AuditLogPage"));
const FleetPage = lazy(() => import("./pages/fleet/FleetPage"));
const DriftPage = lazy(() => import("./pages/drift/DriftPage"));
const AgentsPage = lazy(() => import("./pages/agents/AgentsPage"));

// Dev-only screenshot fixtures (DESIGN.md §8 verification) — render Fleet/Drift's
// presentational views with static data, no Tauri/core backend required. Not
// linked from any nav; only mounted below when import.meta.env.DEV is true.
const FleetFixture = lazy(() => import("./pages/__fixtures__/FleetFixture"));
const DriftFixture = lazy(() => import("./pages/__fixtures__/DriftFixture"));

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
            <WelcomeScreen
              onDismiss={() => {
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
                <Route path="__fixtures__/fleet" element={<FleetFixture />} />
                <Route path="__fixtures__/drift" element={<DriftFixture />} />
              </>
            )}
            <Route path="/" element={<AppLayout />}>
            {/* Fleet — home */}
            <Route index element={<DefaultRedirect />} />
            <Route path="fleet" element={<FleetPage />} />

            {/* Harness Manager */}
            <Route path="harness/file" element={<HarnessFilePage />} />
            <Route path="harness/plugins" element={<PluginsPage />} />
            <Route path="harness/plugins/:pluginName" element={<PluginExplorerPage />} />
            <Route path="harness/mcp" element={<McpServersPage />} />
            <Route path="harness/hooks" element={<HooksPage />} />
            <Route path="harness/claude-md" element={<ClaudeMdPage />} />
            <Route path="harness/sync" element={<SyncPage />} />
            <Route path="harness/settings" element={<SettingsPage />} />
            <Route path="harness/config/:filename" element={<ConfigFilePage />} />

            {/* Marketplace */}
            <Route path="marketplace/:slug?" element={<MarketplacePage />} />
            <Route path="observatory" element={<DashboardPage />} />
            <Route path="observatory/sessions" element={<SessionsPage />} />

            {/* Agents */}
            <Route path="agents" element={<AgentsPage />} />

            {/* Comparator */}
            <Route path="comparator" element={<ComparatorPage />} />

            {/* Security */}
            <Route path="security/permissions" element={<PermissionsPage />} />
            <Route path="security/secrets" element={<SecretsPage />} />
            <Route path="security/audit" element={<AuditLogPage />} />

            {/* Drift */}
            <Route path="drift" element={<DriftPage />} />

            {/* Preferences */}
            <Route path="preferences" element={<PreferencesPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ObservatoryProvider>
    </>
  );
}
