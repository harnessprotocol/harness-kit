import { lazy, Suspense, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import AppLayout from "./layouts/AppLayout";
import { getDefaultSection, getWelcomeSeen, setWelcomeSeen } from "./lib/preferences";
import { ChatProvider } from "./contexts/ChatContext";
import { ObservatoryProvider } from "./hooks/useObservatoryData";
import { ServiceHealthProvider } from "./contexts/ServiceHealthContext";
import { ToastManager } from "./components/ToastManager";

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
const TerminalsPage = lazy(() => import("./pages/terminals/TerminalsPage"));
const PermissionsPage = lazy(() => import("./pages/security/PermissionsPage"));
const SecretsPage = lazy(() => import("./pages/security/SecretsPage"));
const AuditLogPage = lazy(() => import("./pages/security/AuditLogPage"));
const BoardProjectsPage = lazy(() => import("./pages/board/BoardProjectsPage"));
const BoardKanbanPage = lazy(() => import("./pages/board/BoardKanbanPage"));
const RoadmapProjectsPage = lazy(() => import("./pages/roadmap/RoadmapProjectsPage"));
const RoadmapPage = lazy(() => import("./pages/roadmap/RoadmapPage"));
const ParityDashboardPage = lazy(() => import("./pages/parity/ParityDashboardPage"));
const AIChatPage = lazy(() => import("./pages/ai/AIChatPage"));
const MemoryDashboardPage = lazy(() => import("./pages/memory/MemoryDashboardPage"));
const MemoryGraphPage = lazy(() => import("./pages/memory/MemoryGraphPage"));
const MemoryExplorePage = lazy(() => import("./pages/memory/MemoryExplorePage"));
const MemoryEntitiesPage = lazy(() => import("./pages/memory/MemoryEntitiesPage"));
const MemoryKnowledgePage = lazy(() => import("./pages/memory/MemoryKnowledgePage"));
const MemoryContextPage = lazy(() => import("./pages/memory/MemoryContextPage"));
const MemoryTracePage = lazy(() => import("./pages/memory/MemoryTracePage"));
const MemorySettingsPage = lazy(() => import("./pages/memory/MemorySettingsPage"));
const AgentsPage = lazy(() => import("./pages/agents/AgentsPage"));
const ServicesPage = lazy(() => import("./pages/services/ServicesPage"));

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
    <ServiceHealthProvider>
      <ToastManager />
      <ChatProvider>
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
              <Route path="/" element={<AppLayout />}>
              {/* Harness Manager */}
              <Route index element={<DefaultRedirect />} />
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

              {/* Terminals */}
              <Route path="terminals" element={<TerminalsPage />} />

              {/* Security */}
              <Route path="security/permissions" element={<PermissionsPage />} />
              <Route path="security/secrets" element={<SecretsPage />} />
              <Route path="security/audit" element={<AuditLogPage />} />

              {/* Parity */}
              <Route path="parity" element={<ParityDashboardPage />} />

              {/* Board */}
              <Route path="board" element={<BoardProjectsPage />} />
              <Route path="board/:slug" element={<BoardKanbanPage />} />

              {/* Roadmap */}
              <Route path="roadmap" element={<RoadmapProjectsPage />} />
              <Route path="roadmap/:slug" element={<RoadmapPage />} />

              {/* AI Chat */}
              <Route path="ai-chat" element={<AIChatPage />} />

              {/* Memory */}
              <Route path="memory" element={<MemoryDashboardPage />} />
              <Route path="memory/graph" element={<MemoryGraphPage />} />
              <Route path="memory/explore" element={<MemoryExplorePage />} />
              <Route path="memory/explore/*" element={<MemoryExplorePage />} />
              <Route path="memory/entities" element={<MemoryEntitiesPage />} />
              <Route path="memory/entities/*" element={<MemoryEntitiesPage />} />
              <Route path="memory/knowledge" element={<MemoryKnowledgePage />} />
              <Route path="memory/knowledge/*" element={<MemoryKnowledgePage />} />
              <Route path="memory/context" element={<MemoryContextPage />} />
              <Route path="memory/trace" element={<MemoryTracePage />} />
              <Route path="memory/settings" element={<MemorySettingsPage />} />

              {/* Services */}
              <Route path="services" element={<ServicesPage />} />

              {/* Preferences */}
              <Route path="preferences" element={<PreferencesPage />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </ObservatoryProvider>
      </ChatProvider>
    </ServiceHealthProvider>
  );
}
