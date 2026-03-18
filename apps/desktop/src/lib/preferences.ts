// ── Constants ────────────────────────────────────────────────

export const FONT_SIZE_MIN = 11;
export const FONT_SIZE_MAX = 18;
export const FONT_SIZE_DEFAULT = 13;

export const SIDEBAR_WIDTH_MIN = 160;
export const SIDEBAR_WIDTH_MAX = 320;
export const SIDEBAR_WIDTH_DEFAULT = 208;

export const OBSERVATORY_REFRESH_DEFAULT = 60_000;

// ── Storage keys ─────────────────────────────────────────────

const KEY_FONT_SIZE = "harness-kit-font-size";
const KEY_DENSITY = "harness-kit-density";
const KEY_DEFAULT_SECTION = "harness-kit-default-section";
const KEY_HIDDEN_SECTIONS = "harness-kit-hidden-sections";
const KEY_OBSERVATORY_REFRESH = "harness-kit-observatory-refresh";
const KEY_MARKDOWN_FONT = "harness-kit-markdown-font";
const KEY_SIDEBAR_WIDTH = "harness-kit-sidebar-width";
const KEY_CONFIRM_SAVE = "harness-kit-confirm-save";

// ── Helpers ──────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

// ── Font Size ────────────────────────────────────────────────

export function getFontSize(): number {
  const raw = localStorage.getItem(KEY_FONT_SIZE);
  if (raw === null) return FONT_SIZE_DEFAULT;
  return clamp(Number(raw), FONT_SIZE_MIN, FONT_SIZE_MAX);
}

export function setFontSize(size: number) {
  const clamped = clamp(size, FONT_SIZE_MIN, FONT_SIZE_MAX);
  localStorage.setItem(KEY_FONT_SIZE, String(clamped));
  // Use zoom on #root — scales everything (text, spacing, icons) uniformly,
  // even when components use hardcoded px in inline styles.
  const root = document.getElementById("root");
  if (root) root.style.zoom = String(clamped / FONT_SIZE_DEFAULT);
}

// ── Density ──────────────────────────────────────────────────

export type Density = "comfortable" | "compact";

export function getDensity(): Density {
  const raw = localStorage.getItem(KEY_DENSITY);
  return raw === "compact" ? "compact" : "comfortable";
}

export function setDensity(density: Density) {
  localStorage.setItem(KEY_DENSITY, density);
  document.documentElement.setAttribute("data-density", density);
}

// ── Default Section ──────────────────────────────────────────

export function getDefaultSection(): string {
  return localStorage.getItem(KEY_DEFAULT_SECTION) ?? "/harness/plugins";
}

export function setDefaultSection(path: string) {
  localStorage.setItem(KEY_DEFAULT_SECTION, path);
}

// ── Hidden Sections ──────────────────────────────────────────

export function getHiddenSections(): Set<string> {
  const raw = localStorage.getItem(KEY_HIDDEN_SECTIONS);
  if (!raw) return new Set();
  try {
    const arr = JSON.parse(raw);
    return new Set(arr);
  } catch {
    return new Set();
  }
}

export function setHiddenSections(sections: Set<string>) {
  localStorage.setItem(KEY_HIDDEN_SECTIONS, JSON.stringify([...sections]));
  window.dispatchEvent(new CustomEvent("harness-kit-prefs-changed"));
}

// ── Observatory Refresh ──────────────────────────────────────

export function getObservatoryRefresh(): number {
  const raw = localStorage.getItem(KEY_OBSERVATORY_REFRESH);
  if (raw === null) return OBSERVATORY_REFRESH_DEFAULT;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : OBSERVATORY_REFRESH_DEFAULT;
}

export function setObservatoryRefresh(ms: number) {
  localStorage.setItem(KEY_OBSERVATORY_REFRESH, String(ms));
}

// ── Markdown Font ────────────────────────────────────────────

export type MarkdownFont = "sans" | "mono";

export function getMarkdownFont(): MarkdownFont {
  const raw = localStorage.getItem(KEY_MARKDOWN_FONT);
  return raw === "mono" ? "mono" : "sans";
}

export function setMarkdownFont(font: MarkdownFont) {
  localStorage.setItem(KEY_MARKDOWN_FONT, font);
  window.dispatchEvent(new CustomEvent("harness-kit-prefs-changed"));
}

// ── Confirm Save ────────────────────────────────────────────

export function getConfirmSave(): boolean {
  const raw = localStorage.getItem(KEY_CONFIRM_SAVE);
  return raw === "false" ? false : true;
}

export function setConfirmSave(confirm: boolean) {
  localStorage.setItem(KEY_CONFIRM_SAVE, String(confirm));
}

// ── Sidebar Width ────────────────────────────────────────────

export function getSidebarWidth(): number {
  const raw = localStorage.getItem(KEY_SIDEBAR_WIDTH);
  if (raw === null) return SIDEBAR_WIDTH_DEFAULT;
  return clamp(Number(raw), SIDEBAR_WIDTH_MIN, SIDEBAR_WIDTH_MAX);
}

export function setSidebarWidth(width: number) {
  const clamped = clamp(width, SIDEBAR_WIDTH_MIN, SIDEBAR_WIDTH_MAX);
  localStorage.setItem(KEY_SIDEBAR_WIDTH, String(clamped));
  document.documentElement.style.setProperty("--sidebar-width", `${clamped}px`);
}

// ── Init ─────────────────────────────────────────────────────

/** Apply all stored preferences on boot. Call once at app startup. */
export function initPreferences() {
  setFontSize(getFontSize());
  setDensity(getDensity());
  setSidebarWidth(getSidebarWidth());
}
