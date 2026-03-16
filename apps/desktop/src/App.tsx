import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import AppLayout from "./layouts/AppLayout";
import PluginsPage from "./pages/harness/PluginsPage";
import HooksPage from "./pages/harness/HooksPage";
import SettingsPage from "./pages/harness/SettingsPage";
import FileViewerPage from "./pages/harness/FileViewerPage";
import ClaudeMdPage from "./pages/harness/ClaudeMdPage";
import BrowsePage from "./pages/marketplace/BrowsePage";
import PluginDetailPage from "./pages/marketplace/PluginDetailPage";
import DashboardPage from "./pages/observatory/DashboardPage";
import SessionsPage from "./pages/observatory/SessionsPage";
import ComparatorSetupPage from "./pages/comparator/ComparatorSetupPage";
import ComparatorRunPage from "./pages/comparator/ComparatorRunPage";
import ComparatorHistoryPage from "./pages/comparator/ComparatorHistoryPage";
import ComparatorAnalyticsPage from "./pages/comparator/ComparatorAnalyticsPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AppLayout />}>
          {/* Harness Manager */}
          <Route index element={<Navigate to="/harness/plugins" replace />} />
          <Route path="harness/plugins" element={<PluginsPage />} />
          <Route path="harness/hooks" element={<HooksPage />} />
          <Route path="harness/claude-md" element={<ClaudeMdPage />} />
          <Route path="harness/settings" element={<SettingsPage />} />
          <Route path="harness/settings/:filename" element={<FileViewerPage />} />

          {/* Marketplace */}
          <Route path="marketplace" element={<BrowsePage />} />
          <Route path="marketplace/:slug" element={<PluginDetailPage />} />
          <Route path="observatory" element={<DashboardPage />} />
          <Route path="observatory/sessions" element={<SessionsPage />} />

          {/* Comparator */}
          <Route path="comparator" element={<ComparatorSetupPage />} />
          <Route path="comparator/run/:comparisonId" element={<ComparatorRunPage />} />
          <Route path="comparator/history" element={<ComparatorHistoryPage />} />
          <Route path="comparator/analytics" element={<ComparatorAnalyticsPage />} />
          <Route path="comparator/review/:comparisonId" element={<ComparatorRunPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
