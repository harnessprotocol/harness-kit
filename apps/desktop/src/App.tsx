import { lazy, Suspense, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import AppLayout from "./layouts/AppLayout";
import { getDefaultSection, getWelcomeSeen, setWelcomeSeen } from "./lib/preferences";
import { ChatProvider } from "./contexts/ChatContext";
import { ObservatoryProvider } from "./hooks/useObservatoryData";

function PageLoader() {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      height: "100%",
      color: "var(--fg-subtle)",
      fontSize: 13,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif',
    }}>
      Loading…
    </div>
  );
}

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
          <Route path="harness/file" element={<Suspense fallback={<PageLoader />}><HarnessFilePage /></Suspense>} />
          <Route path="harness/plugins" element={<Suspense fallback={<PageLoader />}><PluginsPage /></Suspense>} />
          <Route path="harness/plugins/:pluginName" element={<Suspense fallback={<PageLoader />}><PluginExplorerPage /></Suspense>} />
          <Route path="harness/mcp" element={<Suspense fallback={<PageLoader />}><McpServersPage /></Suspense>} />
          <Route path="harness/hooks" element={<Suspense fallback={<PageLoader />}><HooksPage /></Suspense>} />
          <Route path="harness/claude-md" element={<Suspense fallback={<PageLoader />}><ClaudeMdPage /></Suspense>} />
          <Route path="harness/sync" element={<Suspense fallback={<PageLoader />}><SyncPage /></Suspense>} />
          <Route path="harness/settings" element={<Suspense fallback={<PageLoader />}><SettingsPage /></Suspense>} />
          <Route path="harness/config/:filename" element={<Suspense fallback={<PageLoader />}><ConfigFilePage /></Suspense>} />

          {/* Marketplace */}
          <Route path="marketplace/:slug?" element={<Suspense fallback={<PageLoader />}><MarketplacePage /></Suspense>} />
          <Route path="observatory" element={<Suspense fallback={<PageLoader />}><DashboardPage /></Suspense>} />
          <Route path="observatory/sessions" element={<Suspense fallback={<PageLoader />}><SessionsPage /></Suspense>} />

          {/* Agents */}
          <Route path="agents" element={<Suspense fallback={<PageLoader />}><AgentsPage /></Suspense>} />

          {/* Comparator */}
          <Route path="comparator" element={<Suspense fallback={<PageLoader />}><ComparatorPage /></Suspense>} />

          {/* Terminals */}
          <Route path="terminals" element={<Suspense fallback={<PageLoader />}><TerminalsPage /></Suspense>} />

          {/* Security */}
          <Route path="security/permissions" element={<Suspense fallback={<PageLoader />}><PermissionsPage /></Suspense>} />
          <Route path="security/secrets" element={<Suspense fallback={<PageLoader />}><SecretsPage /></Suspense>} />
          <Route path="security/audit" element={<Suspense fallback={<PageLoader />}><AuditLogPage /></Suspense>} />

          {/* Parity */}
          <Route path="parity" element={<Suspense fallback={<PageLoader />}><ParityDashboardPage /></Suspense>} />

          {/* Board */}
          <Route path="board" element={<Suspense fallback={<PageLoader />}><BoardProjectsPage /></Suspense>} />
          <Route path="board/:slug" element={<Suspense fallback={<PageLoader />}><BoardKanbanPage /></Suspense>} />

          {/* Roadmap */}
          <Route path="roadmap" element={<Suspense fallback={<PageLoader />}><RoadmapProjectsPage /></Suspense>} />
          <Route path="roadmap/:slug" element={<Suspense fallback={<PageLoader />}><RoadmapPage /></Suspense>} />

          {/* AI Chat */}
          <Route path="ai-chat" element={<Suspense fallback={<PageLoader />}><AIChatPage /></Suspense>} />

          {/* Memory */}
          <Route path="memory" element={<Suspense fallback={<PageLoader />}><MemoryDashboardPage /></Suspense>} />
          <Route path="memory/graph" element={<Suspense fallback={<PageLoader />}><MemoryGraphPage /></Suspense>} />
          <Route path="memory/explore" element={<Suspense fallback={<PageLoader />}><MemoryExplorePage /></Suspense>} />
          <Route path="memory/explore/*" element={<Suspense fallback={<PageLoader />}><MemoryExplorePage /></Suspense>} />
          <Route path="memory/entities" element={<Suspense fallback={<PageLoader />}><MemoryEntitiesPage /></Suspense>} />
          <Route path="memory/entities/*" element={<Suspense fallback={<PageLoader />}><MemoryEntitiesPage /></Suspense>} />
          <Route path="memory/knowledge" element={<Suspense fallback={<PageLoader />}><MemoryKnowledgePage /></Suspense>} />
          <Route path="memory/knowledge/*" element={<Suspense fallback={<PageLoader />}><MemoryKnowledgePage /></Suspense>} />
          <Route path="memory/context" element={<Suspense fallback={<PageLoader />}><MemoryContextPage /></Suspense>} />
          <Route path="memory/trace" element={<Suspense fallback={<PageLoader />}><MemoryTracePage /></Suspense>} />
          <Route path="memory/settings" element={<Suspense fallback={<PageLoader />}><MemorySettingsPage /></Suspense>} />

          {/* Services */}
          <Route path="services" element={<Suspense fallback={<PageLoader />}><ServicesPage /></Suspense>} />

          {/* Preferences */}
          <Route path="preferences" element={<Suspense fallback={<PageLoader />}><PreferencesPage /></Suspense>} />
          </Route>
        </Routes>
      </BrowserRouter>
      </ObservatoryProvider>
    </ChatProvider>
  );
}
