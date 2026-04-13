// membrain API client — health checks and base URL constants
// The iframe handles all real API calls; this module is for health polling only.
export const MEMBRAIN_PORT = 3131;
export const MEMBRAIN_SERVER_BASE = `http://localhost:${MEMBRAIN_PORT}`;
export const MEMBRAIN_API = `${MEMBRAIN_SERVER_BASE}/api/v1`;

export async function checkMembrainHealth(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    const res = await fetch(`${MEMBRAIN_API}/graph/stats`, { signal: controller.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

// ── Harness Kit theme sync ────────────────────────────────────────────────────
// Pushes matching HK palette to membrain so the iframe feels native.

const FONTS = {
  sans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  mono: "'JetBrains Mono', 'Fira Code', Menlo, monospace",
};

const HK_THEME_DARK = {
  name: "harness-kit",
  colors: {
    bg: "#211f1c",
    surface: "#282622",
    fg: "#f2f1ed",
    muted: "#9a9590",
    subtle: "#6e6a64",
    accent: "#7b72f0",
    highlight: "#9d96f5",
    secondary: "#9d96f5",
    success: "#16a34a",
    warning: "#d97706",
    error: "#dc2626",
  },
  fonts: FONTS,
  ui: { radius: "6px", sidebar_width: "200px" },
};

const HK_THEME_LIGHT = {
  name: "harness-kit-light",
  colors: {
    bg: "#f4f2ef",
    surface: "#faf9f7",
    fg: "#181714",
    muted: "#5c5a56",
    subtle: "#9a9892",
    accent: "#5b50e8",
    highlight: "#4338d4",
    secondary: "#4338d4",
    success: "#16a34a",
    warning: "#d97706",
    error: "#dc2626",
  },
  fonts: FONTS,
  ui: { radius: "6px", sidebar_width: "200px" },
};

/** Push the HK-matched theme to membrain. Best-effort — never throws. */
export function syncMembrainTheme(): void {
  const isDark = document.documentElement.classList.contains("dark");
  fetch(`${MEMBRAIN_API}/theme`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(isDark ? HK_THEME_DARK : HK_THEME_LIGHT),
  }).catch(() => {});
}
