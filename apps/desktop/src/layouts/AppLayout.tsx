import { Outlet, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useState, useEffect, useCallback } from "react";
import { open } from "@tauri-apps/plugin-shell";
import { getCurrentWindow } from "@tauri-apps/api/window";
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

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem("sidebar-collapsed") === "true"; } catch { return false; }
  });

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((v) => {
      const next = !v;
      try { localStorage.setItem("sidebar-collapsed", String(next)); } catch {}
      return next;
    });
  }, []);

  useGlobalShortcuts({ navigate, toggleSidebar });
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

  function handleTitlebarMouseDown(e: React.MouseEvent) {
    // Guard covers all interactive elements — extend if non-button interactives are added to the titlebar
    if ((e.target as HTMLElement).closest("button, a, input, [role='button']")) return;
    e.preventDefault();
    getCurrentWindow().startDragging().catch((err) => {
      console.error("[titlebar] startDragging failed:", err);
    });
  }

  return (
    <div
      className="flex flex-col h-screen overflow-hidden"
      style={{ background: "var(--bg-base)", color: "var(--fg-base)" }}
    >
      {/* Title bar */}
      <div
        className="titlebar"
        data-tauri-drag-region
        onMouseDown={handleTitlebarMouseDown}
        style={{
          paddingLeft: "78px",
          gap: "4px",
          borderBottom: "1px solid var(--separator)",
          position: "relative",
        }}
      >
        {/* Frosted glass layer — kept separate from the drag region to avoid WebKit compositing interference */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            background: "var(--bg-sidebar)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            pointerEvents: "none",
          }}
        />
        <button className="titlebar-btn" onClick={toggleSidebar} title="Toggle sidebar (⌘\)">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="1" y="1" width="14" height="14" rx="2" />
            <line x1="5" y1="1" x2="5" y2="15" />
          </svg>
        </button>
        <button className="titlebar-btn" onClick={() => navigate(-1)} title="Back (⌘[)">
          <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
          </svg>
        </button>
        <button className="titlebar-btn" onClick={() => navigate(1)} title="Forward (⌘])">
          <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      {/* Content area: sidebar + main */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar wrapper — controls collapse animation */}
        <div
          style={{
            width: sidebarCollapsed ? 0 : "var(--sidebar-width)",
            flexShrink: 0,
            overflow: "hidden",
            transition: "width 0.15s ease",
            position: "relative",
          }}
        >
          <aside
            className="flex flex-col"
            style={{
              width: "var(--sidebar-width)",
              height: "100%",
              overflowY: "auto",
              background: "var(--bg-sidebar)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              borderRight: "1px solid var(--border-base)",
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
          </aside>

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
        </div>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto" style={{ background: "var(--bg-base)" }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
