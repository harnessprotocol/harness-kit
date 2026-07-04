import { Outlet, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useState, useEffect, useCallback, useRef } from "react";
import { open } from "@tauri-apps/plugin-shell";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useGlobalShortcuts } from "../hooks/useGlobalShortcuts";
import { useArrowNavigation } from "../hooks/useArrowNavigation";
import { useSidebarResize } from "../hooks/useSidebarResize";
import { initTheme } from "../lib/theme";
import { initPreferences, getHiddenSections } from "../lib/preferences";
import { CommandPalette } from "../components/CommandPalette";
import FeedbackModal from "../components/FeedbackModal";
import { useClaudeFileList } from "../hooks/useClaudeFileList";
import { PageBoundary } from "../components/PageBoundary";

type NavSection = {
  id: string;
  label: string;
  path: string;
  icon?: React.ReactNode;
  group?: string;
  children?: { label: string; path: string }[];
};

export const NAV_SECTIONS: NavSection[] = [
  {
    id: "fleet",
    label: "Fleet",
    group: "WORKSPACE",
    icon: (
      <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor" style={{ opacity: 0.7, flexShrink: 0 }}>
        <path d="M4 4a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V4zM4 14a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 4a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V4zM14 14a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
      </svg>
    ),
    path: "/fleet",
  },
  {
    id: "harness",
    label: "Configure",
    group: "WORKSPACE",
    icon: (
      <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor" style={{ opacity: 0.7, flexShrink: 0 }}>
        <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
      </svg>
    ),
    path: "/harness/file",
    children: [
      { label: "harness.yaml", path: "/harness/file" },
      { label: "CLAUDE.md", path: "/harness/claude-md" },
      { label: "Plugins", path: "/harness/plugins" },
      { label: "MCP Servers", path: "/harness/mcp" },
      { label: "Hooks", path: "/harness/hooks" },
    ],
  },
  {
    id: "drift",
    label: "Drift",
    group: "WORKSPACE",
    icon: (
      <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor" style={{ opacity: 0.7, flexShrink: 0 }}>
        <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
        <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm9.707 5.707a1 1 0 00-1.414-1.414L9 12.586l-1.293-1.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
      </svg>
    ),
    path: "/drift",
  },
  {
    id: "comparator",
    label: "Comparator",
    group: "WORKSPACE",
    icon: (
      <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor" style={{ opacity: 0.7, flexShrink: 0 }}>
        <path d="M3 4a1 1 0 000 2h11.586l-2.293 2.293a1 1 0 001.414 1.414l4-4a1 1 0 000-1.414l-4-4a1 1 0 10-1.414 1.414L14.586 4H3zM17 16a1 1 0 000-2H5.414l2.293-2.293a1 1 0 00-1.414-1.414l-4 4a1 1 0 000 1.414l4 4a1 1 0 001.414-1.414L5.414 16H17z" />
      </svg>
    ),
    path: "/comparator",
    children: [],
  },
  {
    id: "observatory",
    label: "Observatory",
    group: "WORKSPACE",
    icon: (
      <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor" style={{ opacity: 0.7, flexShrink: 0 }}>
        <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
      </svg>
    ),
    path: "/observatory",
    children: [
      { label: "Dashboard", path: "/observatory" },
      { label: "Sessions", path: "/observatory/sessions" },
    ],
  },
  {
    id: "marketplace",
    label: "Marketplace",
    group: "WORKSPACE",
    icon: (
      <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor" style={{ opacity: 0.7, flexShrink: 0 }}>
        <path d="M3 1a1 1 0 000 2h1.22l.305 1.222a.997.997 0 00.01.042l1.358 5.43-.893.892C3.74 11.846 4.632 14 6.414 14H15a1 1 0 000-2H6.414l1-1H14a1 1 0 00.894-.553l3-6A1 1 0 0017 3H6.28l-.31-1.243A1 1 0 005 1H3zM16 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM6.5 18a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" />
      </svg>
    ),
    path: "/marketplace",
  },
];

// Demoted from top-level nav (harness-detection overlaps Fleet — DESIGN.md §5).
// Route stays reachable at /agents; not rendered in the sidebar or shortcuts.
export const DEMOTED_SECTIONS: NavSection[] = [
  {
    id: "agents",
    label: "Agents",
    icon: (
      <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor" style={{ opacity: 0.7, flexShrink: 0 }}>
        <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
      </svg>
    ),
    path: "/agents",
  },
];

// Files with dedicated nav items — excluded from the Config Files tree
const DEDICATED_NAV_FILES = new Set(["harness.yaml", "CLAUDE.md"]);

function HarnessSubnav({ configFiles }: { configFiles: string[] }) {
  const navigate = useNavigate();
  const [configExpanded, setConfigExpanded] = useState(true);
  const staticItems = [
    { label: "harness.yaml", path: "/harness/file" },
    { label: "CLAUDE.md", path: "/harness/claude-md" },
    { label: "Plugins", path: "/harness/plugins" },
    { label: "MCP Servers", path: "/harness/mcp" },
    { label: "Hooks", path: "/harness/hooks" },
  ];
  const visibleConfigFiles = configFiles.filter((f) => !DEDICATED_NAV_FILES.has(f));
  const syncItem = { label: "Sync", path: "/harness/sync" };
  const allItems = [
    syncItem,
    ...staticItems,
    ...(configExpanded ? visibleConfigFiles.map((f) => ({ label: f, path: `/harness/config/${encodeURIComponent(f)}` })) : []),
  ];
  const { focusedIndex, onKeyDown } = useArrowNavigation({
    count: allItems.length,
    onActivate: (i) => navigate(allItems[i].path),
  });

  return (
    <div className="mt-0.5 mb-1" tabIndex={0} onKeyDown={onKeyDown} style={{ outline: "none" }}>
      {/* Sync — action at top, separated from files below */}
      <NavLink
        to="/harness/sync"
        className={({ isActive }) => `sidebar-subitem${isActive ? " active" : ""}`}
        style={{
          display: "flex", alignItems: "center", gap: "5px",
          ...(focusedIndex === 0 ? { outline: "2px solid var(--accent)", outlineOffset: "-2px", borderRadius: "5px" } : {}),
        }}
      >
        <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor" style={{ opacity: 0.6, flexShrink: 0 }}>
          <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
        </svg>
        Sync
      </NavLink>

      <div style={{ margin: "4px 8px 4px", borderTop: "1px solid var(--separator)" }} />

      {/* Static file items */}
      {staticItems.map((item, idx) => (
        <NavLink
          key={item.path}
          to={item.path}
          end={item.path === "/harness/plugins" ? false : undefined}
          className={({ isActive }) => `sidebar-subitem${isActive ? " active" : ""}`}
          style={focusedIndex === idx + 1 ? { outline: "2px solid var(--accent)", outlineOffset: "-2px", borderRadius: "5px" } : undefined}
        >
          {item.label}
        </NavLink>
      ))}

      {/* Config Files section header — collapsible */}
      {visibleConfigFiles.length > 0 && (
        <button
          onClick={() => setConfigExpanded((v) => !v)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
            padding: "8px 8px 2px",
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: "10px",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            color: "var(--fg-subtle)",
          }}
        >
          Config Files
          <svg
            width="10"
            height="10"
            viewBox="0 0 16 16"
            fill="currentColor"
            style={{ transform: configExpanded ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.15s ease", flexShrink: 0 }}
          >
            <path d="M8 10.5L2.5 5h11L8 10.5z" />
          </svg>
        </button>
      )}

      {/* Dynamic file items */}
      {configExpanded && visibleConfigFiles.map((file, idx) => {
        const path = `/harness/config/${encodeURIComponent(file)}`;
        const itemIdx = 1 + staticItems.length + idx;
        return (
          <NavLink
            key={file}
            to={path}
            className={({ isActive }) => `sidebar-subitem${isActive ? " active" : ""}`}
            style={{
              paddingLeft: "20px",
              ...(focusedIndex === itemIdx ? { outline: "2px solid var(--accent)", outlineOffset: "-2px", borderRadius: "5px" } : {}),
            }}
          >
            {file}
          </NavLink>
        );
      })}
    </div>
  );
}

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
          end={child.path === "/harness/plugins" ? false : undefined}
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

  const [harnessExpanded, setHarnessExpanded] = useState(
    () => location.pathname.startsWith("/harness")
  );
  // Auto-expand when navigating into harness from another section
  const prevPathRef = useRef(location.pathname);
  useEffect(() => {
    const wasHarness = prevPathRef.current.startsWith("/harness");
    const isHarness = location.pathname.startsWith("/harness");
    if (!wasHarness && isHarness) setHarnessExpanded(true);
    prevPathRef.current = location.pathname;
  }, [location.pathname]);

  useGlobalShortcuts({ navigate, toggleSidebar });
  const { onMouseDown: onResizeMouseDown } = useSidebarResize();
  const { files: configFiles } = useClaudeFileList();

  const [hiddenSections, setHiddenSectionsState] = useState(getHiddenSections);
  const [paletteOpen, setPaletteOpen] = useState(false);

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

  // Cmd+K opens the command palette from anywhere.
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.metaKey && !e.shiftKey && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const visibleSections = NAV_SECTIONS.filter((s) => !hiddenSections.has(s.id));

  const prefsActive = location.pathname.startsWith("/preferences");
  const [feedbackOpen, setFeedbackOpen] = useState(false);

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
        <button className="titlebar-btn" onClick={toggleSidebar} title="Toggle sidebar (⌘\)" aria-label="Toggle sidebar (⌘\)">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="1" y="1" width="14" height="14" rx="2" />
            <line x1="5" y1="1" x2="5" y2="15" />
          </svg>
        </button>
        <button className="titlebar-btn" onClick={() => navigate(-1)} title="Back (⌘[)" aria-label="Back (⌘[)">
          <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
          </svg>
        </button>
        <button className="titlebar-btn" onClick={() => navigate(1)} title="Forward (⌘])" aria-label="Forward (⌘])">
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
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                {/* PROVISIONAL mark — mirrors website HarnessKitLogo.tsx; redesign planned (see that file's TODO(brand)) */}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 32 32"
                  style={{ width: 22, height: 22, filter: "drop-shadow(0 0 6px color-mix(in srgb, var(--accent) 50%, transparent))", flexShrink: 0 }}
                >
                  <rect width="32" height="32" rx="7" fill="#131215" />
                  <g stroke="#6BC0F5" strokeWidth="2.8" strokeLinecap="round" fill="none">
                    <path d="M9 9.5 C 15 11, 17.5 13.5, 19.4 14.9" />
                    <path d="M9 22.5 C 15 21, 17.5 18.5, 19.4 17.1" />
                  </g>
                  <circle cx="9" cy="9.5" r="1.9" fill="#6BC0F5" />
                  <circle cx="9" cy="22.5" r="1.9" fill="#6BC0F5" />
                  <circle cx="22" cy="16" r="3.3" fill="#6BC0F5" />
                </svg>
                <span style={{ fontSize: "13px", fontWeight: 600, letterSpacing: "-0.1px", color: "var(--fg-base)" }}>
                  harness-kit
                </span>
              </div>
            </div>

            {/* Nav */}
            <nav className="flex-1 py-2 px-2">
              {visibleSections.map((section, idx) => {
                const active = isActive(section);
                const sectionIndex = NAV_SECTIONS.indexOf(section);
                const shortcutNum = sectionIndex >= 0 && sectionIndex < 8 ? sectionIndex + 1 : null;
                // Show group header when group changes
                const prevSection = idx > 0 ? visibleSections[idx - 1] : null;
                const showGroupHeader = section.group && section.group !== prevSection?.group;
                return (
                  <div key={section.id}>
                    {showGroupHeader && (
                      <div className="sidebar-group-header">{section.group}</div>
                    )}
                    <div className="mb-0.5">
                      {section.id === "harness" ? (
                        <button
                          onClick={() => {
                            if (!active) {
                              navigate(section.path);
                              setHarnessExpanded(true);
                            } else {
                              setHarnessExpanded((v) => !v);
                            }
                          }}
                          className={`sidebar-item${active ? " active" : ""}`}
                          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", cursor: "pointer", border: "none", background: "transparent", textAlign: "left" }}
                        >
                          {section.icon}
                          <span style={{ flex: 1 }}>{section.label}</span>
                          <svg
                            width="10"
                            height="10"
                            viewBox="0 0 16 16"
                            fill="currentColor"
                            style={{ transform: harnessExpanded ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.15s ease", flexShrink: 0, opacity: 0.6 }}
                          >
                            <path d="M8 10.5L2.5 5h11L8 10.5z" />
                          </svg>
                        </button>
                      ) : (
                        <NavLink to={section.path} className={`sidebar-item${active ? " active" : ""}`}>
                          {section.icon}
                          <span style={{ flex: 1 }}>{section.label}</span>
                          {shortcutNum && !sidebarCollapsed && (
                            <span
                              style={{
                                fontSize: 10,
                                fontFamily: 'ui-monospace, monospace',
                                color: 'var(--fg-subtle)',
                                flexShrink: 0,
                              }}
                            >
                              {'\u2318'}{shortcutNum}
                            </span>
                          )}
                        </NavLink>
                      )}

                      {active && section.id === "harness" && harnessExpanded && (
                        <HarnessSubnav configFiles={configFiles} />
                      )}
                      {active && section.children && section.children.length > 0 && section.id !== "harness" && (
                        <SidebarSubnav children={section.children} />
                      )}
                    </div>
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

              <button
                onClick={() => setFeedbackOpen(true)}
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
                  <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zm-4 0H9v2h2V9z" clipRule="evenodd" />
                </svg>
                Feedback
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
                Settings
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
          <PageBoundary locationKey={location.pathname}>
            <Outlet />
          </PageBoundary>
        </main>
      </div>

      <FeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} sections={NAV_SECTIONS} />
    </div>
  );
}
