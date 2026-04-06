import { Outlet, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useState, useEffect, useCallback, useRef } from "react";
import { open } from "@tauri-apps/plugin-shell";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useGlobalShortcuts } from "../hooks/useGlobalShortcuts";
import { useArrowNavigation } from "../hooks/useArrowNavigation";
import { useSidebarResize } from "../hooks/useSidebarResize";
import { initTheme } from "../lib/theme";
import { initPreferences, getHiddenSections } from "../lib/preferences";
import { useChat } from "../context/ChatContext";
import ChatPanel from "../components/chat/ChatPanel";
import { useClaudeFileList } from "../hooks/useClaudeFileList";

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
    id: "terminals",
    label: "Comparator",
    path: "/terminals",
    children: [],
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
    id: "parity",
    label: "Parity",
    path: "/parity",
    children: [
      { label: "Dashboard", path: "/parity" },
    ],
  },
  {
    id: "board",
    label: "Board",
    path: "/board",
  },
  {
    id: "roadmap",
    label: "Roadmap",
    path: "/roadmap",
  },
  {
    id: "ai-chat",
    label: "AI Chat",
    path: "/ai-chat",
  },
  {
    id: "memory",
    label: "Memory",
    path: "/memory",
    children: [
      { label: "Dashboard", path: "/memory" },
      { label: "Graph", path: "/memory/graph" },
      { label: "Explore", path: "/memory/explore" },
      { label: "Entities", path: "/memory/entities" },
      { label: "Knowledge", path: "/memory/knowledge" },
      { label: "Context", path: "/memory/context" },
      { label: "Trace", path: "/memory/trace" },
      { label: "Settings", path: "/memory/settings" },
    ],
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
  const { isOpen: chatOpen, setOpen: setChatOpen, unreadCount } = useChat();

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

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.metaKey && e.shiftKey && e.key === "\\") {
        e.preventDefault();
        setChatOpen(!chatOpen);
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setChatOpen, chatOpen]);

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
        <button
          className="titlebar-btn"
          onClick={() => setChatOpen(!chatOpen)}
          title="Team Chat (⌘⇧\)"
          style={{ marginLeft: "auto", position: "relative" }}
        >
          {/* Speech bubble icon — communicates team chat */}
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M14 7C14 10.3137 11.3137 13 8 13C7.0401 13 6.1327 12.773 5.327 12.373L2 13.5L3.1 10.4C2.41 9.49 2 8.29 2 7C2 3.6863 4.6863 1 8 1C11.3137 1 14 3.6863 14 7Z" strokeLinejoin="round" />
          </svg>
          {unreadCount > 0 && (
            <span style={{
              position: "absolute", top: "2px", right: "2px",
              width: "6px", height: "6px",
              background: "var(--danger)", borderRadius: "50%",
            }} />
          )}
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
                const sectionIndex = NAV_SECTIONS.indexOf(section);
                const shortcutNum = sectionIndex >= 0 && sectionIndex < 8 ? sectionIndex + 1 : null;
                return (
                  <div key={section.id} className="mb-0.5">
                    {section.id === "harness" ? (
                      <button
                        onClick={() => setHarnessExpanded((v) => !v)}
                        className={`sidebar-item${active ? " active" : ""}`}
                        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", cursor: "pointer", border: "none", background: "transparent", textAlign: "left" }}
                      >
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
                    {active && section.children && section.id !== "harness" && (
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

        {/* Right sidebar: chat panel */}
        <div style={{
          width: chatOpen ? "340px" : 0,
          flexShrink: 0,
          overflow: "hidden",
          transition: "width 0.15s ease",
        }}>
          <ChatPanel />
        </div>
      </div>
    </div>
  );
}
