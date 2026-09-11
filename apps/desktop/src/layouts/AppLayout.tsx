import { Outlet, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useState, useEffect, useCallback } from "react";
import { open } from "@tauri-apps/plugin-shell";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { NavItem } from "@harness-kit/ui";
import { useGlobalShortcuts } from "../hooks/useGlobalShortcuts";
import { useArrowNavigation } from "../hooks/useArrowNavigation";
import { useSidebarResize } from "../hooks/useSidebarResize";
import { initTheme } from "../lib/theme";
import { initPreferences, getLabs } from "../lib/preferences";
import { CommandPalette } from "../components/CommandPalette";
import { useClaudeFileList } from "../hooks/useClaudeFileList";
import { PageBoundary } from "../components/PageBoundary";
import { NAV, SETTINGS, visibleNav, type NavEntry } from "../nav";

// Files with dedicated nav items — excluded from the Config Files tree
const DEDICATED_NAV_FILES = new Set(["harness.yaml", "CLAUDE.md"]);

/**
 * Renders a nav entry's static children plus, for Claude Code, the dynamic
 * "Config Files" list sourced from useClaudeFileList (everything under
 * ~/.claude/ that doesn't already have a dedicated child link above).
 */
function NavChildren({ entry, configFiles }: { entry: NavEntry; configFiles: string[] }) {
  const navigate = useNavigate();
  const [configExpanded, setConfigExpanded] = useState(true);
  const staticItems = entry.children ?? [];
  const showDynamicFiles = entry.id === "claude-code";
  const visibleConfigFiles = showDynamicFiles ? configFiles.filter((f) => !DEDICATED_NAV_FILES.has(f)) : [];
  const allItems = [
    ...staticItems,
    ...(configExpanded ? visibleConfigFiles.map((f) => ({ label: f, path: `/harness/config/${encodeURIComponent(f)}` })) : []),
  ];
  const { focusedIndex, onKeyDown } = useArrowNavigation({
    count: allItems.length,
    onActivate: (i) => navigate(allItems[i].path),
  });

  return (
    <div className="mt-0.5 mb-1" tabIndex={0} onKeyDown={onKeyDown} style={{ outline: "none" }}>
      {/* Static children */}
      {staticItems.map((item, idx) => (
        <NavLink
          key={item.path}
          to={item.path}
          end={item.path === "/harness/plugins" ? false : undefined}
          className={({ isActive }) => `sidebar-subitem${isActive ? " active" : ""}`}
          style={focusedIndex === idx ? { outline: "2px solid var(--accent)", outlineOffset: "-2px", borderRadius: "5px" } : undefined}
        >
          {item.label}
        </NavLink>
      ))}

      {/* Config Files section header — collapsible, Claude Code only */}
      {showDynamicFiles && visibleConfigFiles.length > 0 && (
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
      {showDynamicFiles && configExpanded && visibleConfigFiles.map((file, idx) => {
        const path = `/harness/config/${encodeURIComponent(file)}`;
        const itemIdx = staticItems.length + idx;
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

/**
 * Whether a nav entry is the one the user is on.
 *
 * Compares against the entry's own PATH, not against `/<id>`. Drift's
 * destination is `/machine?drift=1` (a query-qualified entry can share a
 * pathname with a plain sibling), so an id-based match could never work for
 * it — the item the user had just clicked would go dark while Machine lit
 * up instead.
 *
 * Two entries can share a pathname and be told apart by a query marker, so
 * the marker is checked in BOTH directions: present selects the qualified
 * entry, absent selects the plain one. No current NAV entry carries a query
 * marker, but the command palette's "Open Drift" command points at
 * /machine?drift=1, so this stays generic rather than assuming query-free
 * paths forever.
 */
export function isSectionActive(
  section: { path: string },
  location: { pathname: string; search: string },
): boolean {
  const [sectionPath, sectionQuery] = section.path.split("?");
  if (!location.pathname.startsWith(sectionPath)) return false;
  const params = new URLSearchParams(location.search);
  const marker = sectionQuery?.split("=")[0];
  if (marker !== undefined) return params.get(marker) !== null;
  // A plain entry loses to a query-qualified sibling on the same pathname.
  return !NAV.some((candidate) => {
    const [candidatePath, candidateQuery] = candidate.path.split("?");
    if (candidateQuery === undefined || candidatePath !== sectionPath) return false;
    return params.get(candidateQuery.split("=")[0]) !== null;
  });
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
  const { files: configFiles } = useClaudeFileList();

  const [labs, setLabs] = useState(getLabs);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    initTheme();
    initPreferences();
  }, []);

  useEffect(() => {
    function onPrefsChanged() {
      setLabs(getLabs());
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

  const entries = visibleNav(labs);

  const prefsActive = location.pathname.startsWith(SETTINGS.path);

  function isActive(entry: NavEntry) {
    return isSectionActive(entry, location);
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
                  Harness Kit
                </span>
              </div>
            </div>

            {/* Nav — one flat list, no group header (spec AC-4: single navigation declaration) */}
            <nav className="flex-1 py-2 px-2">
              {entries.map((entry) => {
                const active = isActive(entry);
                const Icon = entry.icon;
                return (
                  <div key={entry.id} className="mb-0.5">
                    <NavItem
                      active={active}
                      icon={<Icon size={15} strokeWidth={1.7} />}
                      onClick={() => navigate(entry.path)}
                      badge={
                        entry.shortcut && !sidebarCollapsed ? (
                          <span
                            style={{
                              fontSize: 10,
                              fontFamily: 'ui-monospace, monospace',
                              color: 'var(--fg-subtle)',
                              flexShrink: 0,
                            }}
                          >
                            {'⌘'}{entry.shortcut}
                          </span>
                        ) : undefined
                      }
                    >
                      {entry.label}
                    </NavItem>

                    {active && entry.children && entry.children.length > 0 && (
                      <NavChildren entry={entry} configFiles={configFiles} />
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

            {/* Bottom bar: Settings */}
            <div
              className="px-2 py-2"
              style={{ borderTop: "1px solid var(--separator)" }}
            >
              <button
                onClick={() => navigate(SETTINGS.path)}
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
                <SETTINGS.icon size={13} strokeWidth={1.7} />
                {SETTINGS.label}
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

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} sections={entries} />
    </div>
  );
}
