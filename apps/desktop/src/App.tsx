import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import AppLayout from "./layouts/AppLayout";
import PluginsPage from "./pages/harness/PluginsPage";
import HooksPage from "./pages/harness/HooksPage";
import SettingsPage from "./pages/harness/SettingsPage";
import ClaudeMdPage from "./pages/harness/ClaudeMdPage";
import ComingSoonPage from "./pages/ComingSoonPage";

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

          {/* Other sections — coming soon */}
          <Route
            path="marketplace/*"
            element={<ComingSoonPage title="Marketplace" description="Browse and install plugins from the harness-kit registry." />}
          />
          <Route
            path="observatory/*"
            element={<ComingSoonPage title="Observatory" description="Visualize your Claude Code usage patterns and token metrics." />}
          />
          <Route
            path="comparator/*"
            element={<ComingSoonPage title="Comparator" description="Run side-by-side comparisons of AI tools and models on real tasks." />}
          />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
