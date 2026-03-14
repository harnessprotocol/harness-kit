import { Outlet, NavLink, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { initTheme, toggleTheme, getTheme } from "../lib/theme";

type NavSection = {
  id: string;
  label: string;
  path: string;
  children?: { label: string; path: string }[];
};

const NAV_SECTIONS: NavSection[] = [
  {
    id: "harness",
    label: "Harness",
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
    path: "/marketplace",
    children: [
      { label: "Browse", path: "/marketplace" },
    ],
  },
  {
    id: "observatory",
    label: "Observatory",
    path: "/observatory",
  },
  {
    id: "comparator",
    label: "Comparator",
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
    <div
      className="flex h-screen overflow-hidden"
      style={{ background: "var(--bg-base)", color: "var(--fg-base)" }}
    >
      {/* Sidebar */}
      <aside
        className="flex flex-col shrink-0 overflow-y-auto"
        style={{
          width: "var(--sidebar-width)",
          background: "var(--bg-sidebar-solid)",
          borderRight: "1px solid var(--border-base)",
        }}
      >
        {/* App name */}
        <div
          className="flex items-center px-4"
          style={{
            height: "44px",
            borderBottom: "1px solid var(--separator)",
          }}
        >
          <span
            style={{
              fontSize: "13px",
              fontWeight: 600,
              letterSpacing: "-0.1px",
              color: "var(--fg-base)",
            }}
          >
            harness-kit
          </span>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-2 px-2">
          {NAV_SECTIONS.map((section) => {
            const active = isActive(section);
            return (
              <div key={section.id} className="mb-0.5">
                <NavLink
                  to={section.path}
                  className={`sidebar-item${active ? " active" : ""}`}
                >
                  {section.label}
                </NavLink>

                {active && section.children && (
                  <div className="mt-0.5 mb-1">
                    {section.children.map((child) => (
                      <NavLink
                        key={child.path}
                        to={child.path}
                        className={({ isActive: childActive }) =>
                          `sidebar-subitem${childActive ? " active" : ""}`
                        }
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
        <div
          className="px-3 py-3"
          style={{ borderTop: "1px solid var(--separator)" }}
        >
          <button
            onClick={handleToggleTheme}
            className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs transition-colors"
            style={{
              color: "var(--fg-subtle)",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              fontSize: "11px",
            }}
          >
            <span style={{ fontSize: "12px" }}>
              {theme === "dark" ? "☀" : "◑"}
            </span>
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto" style={{ background: "var(--bg-base)" }}>
        <Outlet />
      </main>
    </div>
  );
}
