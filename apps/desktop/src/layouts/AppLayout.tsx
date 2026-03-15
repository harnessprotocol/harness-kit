import { Outlet, NavLink, useLocation } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import {
  initTheme, getTheme, setTheme,
  getAccent, setAccent,
  ACCENT_PRESETS,
  type AccentName,
} from "../lib/theme";

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
  },
];

export default function AppLayout() {
  const location = useLocation();
  const [theme, setThemeState] = useState(getTheme);
  const [accent, setAccentState] = useState(getAccent);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    initTheme();
  }, []);

  // Close settings panel on outside click
  useEffect(() => {
    if (!settingsOpen) return;
    function onPointerDown(e: PointerEvent) {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [settingsOpen]);

  function handleSetTheme(t: "light" | "dark" | "system") {
    setTheme(t);
    setThemeState(t);
  }

  function handleSetAccent(name: AccentName) {
    setAccent(name);
    setAccentState(name);
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
          position: "relative",
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
          {NAV_SECTIONS.map((section) => {
            const active = isActive(section);
            return (
              <div key={section.id} className="mb-0.5">
                <NavLink to={section.path} className={`sidebar-item${active ? " active" : ""}`}>
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

        {/* Preferences panel (floats above gear button) */}
        {settingsOpen && (
          <div
            ref={settingsRef}
            style={{
              position: "absolute",
              bottom: "48px",
              left: "8px",
              right: "8px",
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-base)",
              borderRadius: "10px",
              boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
              padding: "14px",
              zIndex: 50,
            }}
          >
            <p style={{ fontSize: "11px", fontWeight: 700, color: "var(--fg-base)", margin: "0 0 12px", letterSpacing: "-0.1px" }}>
              Preferences
            </p>

            {/* Theme */}
            <p style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--fg-subtle)", margin: "0 0 6px" }}>
              Appearance
            </p>
            <div style={{ display: "flex", gap: "4px", marginBottom: "14px" }}>
              {(["light", "system", "dark"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => handleSetTheme(t)}
                  style={{
                    flex: 1,
                    fontSize: "11px",
                    padding: "5px 0",
                    borderRadius: "5px",
                    border: "1px solid",
                    borderColor: theme === t ? "var(--accent)" : "var(--border-base)",
                    background: theme === t ? "var(--accent-light)" : "transparent",
                    color: theme === t ? "var(--accent-text)" : "var(--fg-muted)",
                    cursor: "pointer",
                    textTransform: "capitalize",
                    fontWeight: theme === t ? 600 : 400,
                  }}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* Accent color */}
            <p style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--fg-subtle)", margin: "0 0 6px" }}>
              Accent Color
            </p>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {(Object.entries(ACCENT_PRESETS) as [AccentName, typeof ACCENT_PRESETS[AccentName]][]).map(([name, preset]) => (
                <button
                  key={name}
                  title={preset.label}
                  onClick={() => handleSetAccent(name)}
                  style={{
                    width: "22px",
                    height: "22px",
                    borderRadius: "50%",
                    background: preset.swatch,
                    border: accent === name ? "2px solid var(--fg-base)" : "2px solid transparent",
                    cursor: "pointer",
                    outline: accent === name ? "2px solid var(--accent)" : "none",
                    outlineOffset: "1px",
                    padding: 0,
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {/* Bottom bar: gear button */}
        <div
          className="px-2 py-2"
          style={{ borderTop: "1px solid var(--separator)" }}
        >
          <button
            onClick={() => setSettingsOpen((o) => !o)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              width: "100%",
              padding: "6px 8px",
              borderRadius: "6px",
              border: "none",
              background: settingsOpen ? "var(--accent-light)" : "transparent",
              color: settingsOpen ? "var(--accent-text)" : "var(--fg-subtle)",
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

      {/* Main content */}
      <main className="flex-1 overflow-y-auto" style={{ background: "var(--bg-base)" }}>
        <Outlet />
      </main>
    </div>
  );
}
