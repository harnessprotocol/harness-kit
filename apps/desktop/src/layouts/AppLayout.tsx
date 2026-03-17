import { Outlet, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { open } from "@tauri-apps/plugin-shell";
import { useGlobalShortcuts } from "../hooks/useGlobalShortcuts";
import { useArrowNavigation } from "../hooks/useArrowNavigation";
import { useSidebarResize } from "../hooks/useSidebarResize";
import { initTheme } from "../lib/theme";
import { initPreferences, getHiddenSections } from "../lib/preferences";

type NavSection = {
  id: string;
  label: string;
  path: string;
  children?: { label: string; path: string }[];
};

export const NAV_SECTIONS: NavSection[] = [
  {
    id: "harness",
    label: "Harness",
    path: "/harness/plugins",
    children: [
      { label: "Plugins", path: "/harness/plugins" },
      { label: "Hooks", path: "/harness/hooks" },
      { label: "CLAUDE.md", path: "/harness/claude-md" },
      { label: "Config Files", path: "/harness/settings" },
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
    children: [
      { label: "Dashboard", path: "/observatory" },
      { label: "Sessions", path: "/observatory/sessions" },
    ],
  },
  {
    id: "comparator",
    label: "Comparator",
    path: "/comparator",
    children: [
      { label: "New Comparison", path: "/comparator" },
      { label: "History", path: "/comparator/history" },
      { label: "Analytics", path: "/comparator/analytics" },
    ],
  },
  {
    id: "security",
    label: "Security",
    path: "/security/permissions",
    children: [
      { label: "Permissions", path: "/security/permissions" },
      { label: "Secrets", path: "/security/secrets" },
      { label: "Audit Log", path: "/security/audit" },
    ],
  },
  {
    id: "board",
    label: "Board",
    path: "/board",
  },
];

function SidebarSubnav({ children }: { children: { label: string; path: string }[] }) {
  const navigate = useNavigate();
  const { focusedIndex, onKeyDown } = useArrowNavigation({
    count: children.length,
    onActivate: (i) => navigate(children[i].path),
  });

  return (
    <div className="mt-0.5 mb-1" tabIndex={0} onKeyDown={onKeyDown} style={{ outline: "none" }}>
      {children.map((child, idx) => (
        <NavLink
          key={child.path}
          to={child.path}
          className={({ isActive: childActive }) =>
            `sidebar-subitem${childActive ? " active" : ""}`
          }
          style={focusedIndex === idx ? { outline: "2px solid var(--accent)", outlineOffset: "-2px", borderRadius: "5px" } : undefined}
        >
          {child.label}
        </NavLink>
      ))}
    </div>
  );
}

export default function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();

  useGlobalShortcuts({ navigate });
  const { onMouseDown: onResizeMouseDown } = useSidebarResize();

  const [hiddenSections, setHiddenSectionsState] = useState(getHiddenSections);

  useEffect(() => {
    initTheme();
    initPreferences();
  }, []);

  useEffect(() => {
    function onPrefsChanged() {
      setHiddenSectionsState(getHiddenSections());
    }
    window.addEventListener("harness-kit-prefs-changed", onPrefsChanged);
    return () => window.removeEventListener("harness-kit-prefs-changed", onPrefsChanged);
  }, []);

  const visibleSections = NAV_SECTIONS.filter((s) => !hiddenSections.has(s.id));

  const prefsActive = location.pathname === "/preferences";

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
          background: "var(--bg-sidebar)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderRight: "1px solid var(--border-base)",
          position: "fixed",
          top: 0,
          left: 0,
          bottom: 0,
          zIndex: 30,
        }}
      >
        {/* App name */}
        <div
          className="flex items-center px-4"
          style={{ height: "44px", borderBottom: "1px solid var(--separator)" }}
        >
          <span style={{ fontSize: "13px", fontWeight: 600, letterSpacing: "-0.1px", color: "var(--fg-base)" }}>
            harness-kit
          </span>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-2 px-2">
          {visibleSections.map((section) => {
            const active = isActive(section);
            return (
              <div key={section.id} className="mb-0.5">
                <NavLink to={section.path} className={`sidebar-item${active ? " active" : ""}`}>
                  {section.label}
                </NavLink>

                {active && section.children && (
                  <SidebarSubnav children={section.children} />
                )}
              </div>
            );
          })}
        </nav>

        {/* Docs link — always visible */}
        <div className="px-2 pb-1">
          <button
            onClick={() => open("https://harnesskit.ai/docs")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              width: "100%",
              padding: "6px 8px",
              borderRadius: "6px",
              border: "none",
              background: "transparent",
              color: "var(--fg-subtle)",
              cursor: "pointer",
              fontSize: "11px",
              textAlign: "left",
            }}
          >
            <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor">
              <path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z" />
            </svg>
            Docs
            <svg width="9" height="9" viewBox="0 0 20 20" fill="currentColor" style={{ marginLeft: "auto", opacity: 0.5 }}>
              <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
              <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
            </svg>
          </button>
        </div>

        {/* Bottom bar: gear button */}
        <div
          className="px-2 py-2"
          style={{ borderTop: "1px solid var(--separator)" }}
        >
          <button
            onClick={() => navigate("/preferences")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              width: "100%",
              padding: "6px 8px",
              borderRadius: "6px",
              border: "none",
              background: prefsActive ? "var(--accent-light)" : "transparent",
              color: prefsActive ? "var(--accent-text)" : "var(--fg-subtle)",
              cursor: "pointer",
              fontSize: "11px",
              textAlign: "left",
            }}
          >
            <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
            </svg>
            Preferences
          </button>
        </div>

        {/* Drag handle for sidebar resize */}
        <div
          onMouseDown={onResizeMouseDown}
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            width: "4px",
            height: "100%",
            cursor: "col-resize",
            zIndex: 40,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        />
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto" style={{ background: "var(--bg-base)", paddingLeft: "var(--sidebar-width)" }}>
        <Outlet />
      </main>
    </div>
  );
}
