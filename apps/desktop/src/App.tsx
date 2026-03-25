import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import AppLayout from "./layouts/AppLayout";
import PreferencesPage from "./pages/PreferencesPage";
import { getDefaultSection } from "./lib/preferences";
import { ChatProvider } from "./context/ChatContext";
import ChatPanel from "./components/chat/ChatPanel";
import HarnessFilePage from "./pages/harness/HarnessFilePage";
import PluginsPage from "./pages/harness/PluginsPage";
import HooksPage from "./pages/harness/HooksPage";
import SettingsPage from "./pages/harness/SettingsPage";
import FileViewerPage from "./pages/harness/FileViewerPage";
import ClaudeMdPage from "./pages/harness/ClaudeMdPage";
import SyncPage from "./pages/harness/SyncPage";
import MarketplacePage from "./pages/marketplace/MarketplacePage";
import DashboardPage from "./pages/observatory/DashboardPage";
import SessionsPage from "./pages/observatory/SessionsPage";
import ComparatorSetupPage from "./pages/comparator/ComparatorSetupPage";
import ComparatorRunPage from "./pages/comparator/ComparatorRunPage";
import ComparatorHistoryPage from "./pages/comparator/ComparatorHistoryPage";
import ComparatorAnalyticsPage from "./pages/comparator/ComparatorAnalyticsPage";
import PermissionsPage from "./pages/security/PermissionsPage";
import SecretsPage from "./pages/security/SecretsPage";
import AuditLogPage from "./pages/security/AuditLogPage";
import BoardProjectsPage from "./pages/board/BoardProjectsPage";
import BoardKanbanPage from "./pages/board/BoardKanbanPage";
import ParityDashboardPage from "./pages/parity/ParityDashboardPage";

function DefaultRedirect() {
  const defaultSection = getDefaultSection();
  return <Navigate to={defaultSection} replace />;
}

export default function App() {
  return (
    <ChatProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<AppLayout />}>
          {/* Harness Manager */}
          <Route index element={<DefaultRedirect />} />
          <Route path="harness/file" element={<HarnessFilePage />} />
          <Route path="harness/plugins" element={<PluginsPage />} />
          <Route path="harness/hooks" element={<HooksPage />} />
          <Route path="harness/claude-md" element={<ClaudeMdPage />} />
          <Route path="harness/sync" element={<SyncPage />} />
          <Route path="harness/settings" element={<SettingsPage />} />
          <Route path="harness/settings/:filename" element={<FileViewerPage />} />

          {/* Marketplace */}
          <Route path="marketplace/:slug?" element={<MarketplacePage />} />
          <Route path="observatory" element={<DashboardPage />} />
          <Route path="observatory/sessions" element={<SessionsPage />} />

          {/* Comparator */}
          <Route path="comparator" element={<ComparatorSetupPage />} />
          <Route path="comparator/run/:comparisonId" element={<ComparatorRunPage />} />
          <Route path="comparator/history" element={<ComparatorHistoryPage />} />
          <Route path="comparator/analytics" element={<ComparatorAnalyticsPage />} />
          <Route path="comparator/review/:comparisonId" element={<ComparatorRunPage />} />

          {/* Security */}
          <Route path="security/permissions" element={<PermissionsPage />} />
          <Route path="security/secrets" element={<SecretsPage />} />
          <Route path="security/audit" element={<AuditLogPage />} />

          {/* Parity */}
          <Route path="parity" element={<ParityDashboardPage />} />

          {/* Board */}
          <Route path="board" element={<BoardProjectsPage />} />
          <Route path="board/:slug" element={<BoardKanbanPage />} />

          {/* Preferences */}
          <Route path="preferences" element={<PreferencesPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
      <ChatPanel />
    </ChatProvider>
  );
}
