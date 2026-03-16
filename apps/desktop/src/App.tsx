import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import AppLayout from "./layouts/AppLayout";
import PluginsPage from "./pages/harness/PluginsPage";
import HooksPage from "./pages/harness/HooksPage";
import SettingsPage from "./pages/harness/SettingsPage";
import FileViewerPage from "./pages/harness/FileViewerPage";
import ClaudeMdPage from "./pages/harness/ClaudeMdPage";
import ComingSoonPage from "./pages/ComingSoonPage";
import BrowsePage from "./pages/marketplace/BrowsePage";
import PluginDetailPage from "./pages/marketplace/PluginDetailPage";
import DashboardPage from "./pages/observatory/DashboardPage";
import SessionsPage from "./pages/observatory/SessionsPage";

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
          <Route
            path="comparator/*"
            element={<ComingSoonPage title="Comparator" description="Run side-by-side comparisons of AI tools and models on real tasks." />}
          />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
