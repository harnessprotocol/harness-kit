type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "harness-kit-theme";
const ACCENT_KEY = "harness-kit-accent";

function getSystemTheme(): "light" | "dark" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  const resolved = theme === "system" ? getSystemTheme() : theme;
  document.documentElement.classList.toggle("dark", resolved === "dark");
  applyAccent(getAccent(), resolved);
}

export function initTheme() {
  const stored = (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? "system";
  applyTheme(stored);

  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", () => {
      const current = (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? "system";
      if (current === "system") applyTheme("system");
    });
}

export function getTheme(): Theme {
  return (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? "system";
}

export function setTheme(theme: Theme) {
  localStorage.setItem(STORAGE_KEY, theme);
  applyTheme(theme);
}

export function toggleTheme() {
  const current = getTheme();
  const resolved = current === "system" ? getSystemTheme() : current;
  setTheme(resolved === "dark" ? "light" : "dark");
}

// ── Accent colors ─────────────────────────────────────────────

export type AccentName = "purple" | "blue" | "teal" | "green" | "orange" | "rose";

type AccentTokens = { accent: string; light: string; text: string };
type AccentPreset = { dark: AccentTokens; light: AccentTokens; swatch: string; label: string };

export const ACCENT_PRESETS: Record<AccentName, AccentPreset> = {
  purple: {
    swatch: "#7c3aed",
    label: "Purple",
    dark:  { accent: "#7c3aed", light: "rgba(124,58,237,0.15)",  text: "#a78bfa" },
    light: { accent: "#7c3aed", light: "rgba(124,58,237,0.10)",  text: "#6d28d9" },
  },
  blue: {
    swatch: "#2563eb",
    label: "Blue",
    dark:  { accent: "#2563eb", light: "rgba(37,99,235,0.15)",   text: "#60a5fa" },
    light: { accent: "#2563eb", light: "rgba(37,99,235,0.10)",   text: "#1d4ed8" },
  },
  teal: {
    swatch: "#0d9488",
    label: "Teal",
    dark:  { accent: "#0d9488", light: "rgba(13,148,136,0.15)",  text: "#2dd4bf" },
    light: { accent: "#0d9488", light: "rgba(13,148,136,0.10)",  text: "#0f766e" },
  },
  green: {
    swatch: "#16a34a",
    label: "Green",
    dark:  { accent: "#16a34a", light: "rgba(22,163,74,0.15)",   text: "#4ade80" },
    light: { accent: "#16a34a", light: "rgba(22,163,74,0.10)",   text: "#15803d" },
  },
  orange: {
    swatch: "#ea580c",
    label: "Orange",
    dark:  { accent: "#ea580c", light: "rgba(234,88,12,0.15)",   text: "#fb923c" },
    light: { accent: "#ea580c", light: "rgba(234,88,12,0.10)",   text: "#c2410c" },
  },
  rose: {
    swatch: "#e11d48",
    label: "Rose",
    dark:  { accent: "#e11d48", light: "rgba(225,29,72,0.15)",   text: "#fb7185" },
    light: { accent: "#e11d48", light: "rgba(225,29,72,0.10)",   text: "#be123c" },
  },
};

export function getAccent(): AccentName {
  return (localStorage.getItem(ACCENT_KEY) as AccentName | null) ?? "purple";
}

export function setAccent(name: AccentName) {
  localStorage.setItem(ACCENT_KEY, name);
  const resolved = getTheme() === "system" ? getSystemTheme() : (getTheme() as "light" | "dark");
  applyAccent(name, resolved);
}

function applyAccent(name: AccentName, theme: "light" | "dark") {
  const tokens = ACCENT_PRESETS[name][theme];
  const root = document.documentElement.style;
  root.setProperty("--accent", tokens.accent);
  root.setProperty("--accent-light", tokens.light);
  root.setProperty("--accent-text", tokens.text);
}
