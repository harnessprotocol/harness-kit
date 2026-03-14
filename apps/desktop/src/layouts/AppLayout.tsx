import { Outlet, NavLink, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { initTheme, toggleTheme, getTheme } from "../lib/theme";

type NavSection = {
  id: string;
  label: string;
  icon: string;
  path: string;
  children?: { label: string; path: string }[];
};

const NAV_SECTIONS: NavSection[] = [
  {
    id: "harness",
    label: "Harness Manager",
    icon: "⚙️",
    path: "/harness/plugins",
    children: [
      { label: "Plugins", path: "/harness/plugins" },
      { label: "Hooks", path: "/harness/hooks" },
      { label: "CLAUDE.md", path: "/harness/claude-md" },
      { label: "Settings", path: "/harness/settings" },
    ],
  },
  {
    id: "marketplace",
    label: "Marketplace",
    icon: "🛍️",
    path: "/marketplace",
  },
  {
    id: "observatory",
    label: "Observatory",
    icon: "📊",
    path: "/observatory",
  },
  {
    id: "comparator",
    label: "Comparator",
    icon: "⚖️",
    path: "/comparator",
  },
];

export default function AppLayout() {
  const location = useLocation();
  const [theme, setThemeState] = useState(getTheme);

  useEffect(() => {
    initTheme();
  }, []);

  function handleToggleTheme() {
    toggleTheme();
    setThemeState(getTheme());
  }

  function isActive(section: NavSection) {
    return location.pathname.startsWith(`/${section.id}`);
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--bg-base)", color: "var(--fg-base)" }}>
      {/* Sidebar */}
      <aside
        className="flex flex-col shrink-0 overflow-y-auto"
        style={{
          width: "var(--sidebar-width)",
          background: "var(--bg-sidebar)",
          borderRight: "1px solid var(--border-base)",
        }}
      >
        {/* App header */}
        <div
          className="flex items-center gap-2 px-4 py-3"
          style={{ borderBottom: "1px solid var(--border-base)" }}
        >
          <span className="font-semibold text-sm tracking-tight" style={{ color: "var(--fg-base)" }}>
            harness-kit
          </span>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-2">
          {NAV_SECTIONS.map((section) => {
            const active = isActive(section);
            return (
              <div key={section.id}>
                <NavLink
                  to={section.path}
                  className="flex items-center gap-2 px-3 py-1.5 mx-1 rounded text-sm transition-colors"
                  style={() => ({
                    background: active ? "var(--accent-light)" : "transparent",
                    color: active ? "var(--accent)" : "var(--fg-muted)",
                    fontWeight: active ? 500 : 400,
                  })}
                >
                  <span style={{ fontSize: "13px" }}>{section.icon}</span>
                  {section.label}
                </NavLink>

                {/* Sub-nav for active section */}
                {active && section.children && (
                  <div className="ml-4 mt-0.5 mb-1">
                    {section.children.map((child) => (
                      <NavLink
                        key={child.path}
                        to={child.path}
                        className="flex items-center px-3 py-1 mx-1 rounded text-xs transition-colors"
                        style={({ isActive: childActive }) => ({
                          background: childActive ? "var(--accent-light)" : "transparent",
                          color: childActive ? "var(--accent-fg)" : "var(--fg-subtle)",
                          fontWeight: childActive ? 500 : 400,
                        })}
                      >
                        {child.label}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Theme toggle */}
        <div className="px-3 py-3" style={{ borderTop: "1px solid var(--border-base)" }}>
          <button
            onClick={handleToggleTheme}
            className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs transition-colors"
            style={{ color: "var(--fg-subtle)" }}
          >
            <span>{theme === "dark" ? "☀️" : "🌙"}</span>
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
