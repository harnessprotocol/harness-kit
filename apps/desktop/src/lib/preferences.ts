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

export const FILE_EXPLORER_WIDTH_MIN = 140;
export const FILE_EXPLORER_WIDTH_MAX = 360;
export const FILE_EXPLORER_WIDTH_DEFAULT = 200;

const KEY_FILE_EXPLORER_WIDTH = "harness-kit-file-explorer-width";

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

// ── Labs: membrain ───────────────────────────────────────────

const KEY_MEMBRAIN_LABS = "harness-kit-membrain-labs";

/** Returns true only if the user has explicitly opted in to the membrain Labs feature. */
export function getMembrainEnabled(): boolean {
  return localStorage.getItem(KEY_MEMBRAIN_LABS) === "true";
}

export function setMembrainEnabled(enabled: boolean) {
  localStorage.setItem(KEY_MEMBRAIN_LABS, String(enabled));
  window.dispatchEvent(new CustomEvent("harness-kit-prefs-changed"));
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

// ── File Explorer Panel Width ──────────────────────────────────

export function getFileExplorerWidth(): number {
  const raw = localStorage.getItem(KEY_FILE_EXPLORER_WIDTH);
  if (raw === null) return FILE_EXPLORER_WIDTH_DEFAULT;
  return clamp(Number(raw), FILE_EXPLORER_WIDTH_MIN, FILE_EXPLORER_WIDTH_MAX);
}

export function setFileExplorerWidth(width: number) {
  const clamped = clamp(width, FILE_EXPLORER_WIDTH_MIN, FILE_EXPLORER_WIDTH_MAX);
  localStorage.setItem(KEY_FILE_EXPLORER_WIDTH, String(clamped));
}

// ── Config Files Detail Level ─────────────────────────────────

export type ConfigFilesDetailLevel = "essentials" | "text-files" | "all";

const VALID_DETAIL_LEVELS = new Set<ConfigFilesDetailLevel>(["essentials", "text-files", "all"]);
const KEY_CONFIG_FILES_DETAIL = "harness-kit-config-files-detail";

export function getConfigFilesDetailLevel(): ConfigFilesDetailLevel {
  const raw = localStorage.getItem(KEY_CONFIG_FILES_DETAIL);
  return VALID_DETAIL_LEVELS.has(raw as ConfigFilesDetailLevel)
    ? (raw as ConfigFilesDetailLevel)
    : "text-files";
}

export function setConfigFilesDetailLevel(level: ConfigFilesDetailLevel) {
  localStorage.setItem(KEY_CONFIG_FILES_DETAIL, level);
}

// ── Permission Mode ───────────────────────────────────────────

export type PermissionMode = "skip" | "auto" | "allowed-tools";

const KEY_PERMISSION_MODE = "harness-kit-permission-mode";
const KEY_ALLOWED_TOOLS = "harness-kit-allowed-tools";
const KEY_PERMISSION_MODE_ACKED = "harness-kit-permission-mode-acked";
const KEY_HARNESS_PERMISSION_OVERRIDES = "harness-kit-harness-permission-overrides";
const KEY_AUTO_MODE_UNLOCKED = "harness-kit-auto-mode-unlocked";

export const DEFAULT_ALLOWED_TOOLS: string[] = ["Read", "Grep", "Glob"];

export function getPermissionMode(): PermissionMode {
  const raw = localStorage.getItem(KEY_PERMISSION_MODE);
  if (raw === "auto" || raw === "allowed-tools") return raw;
  return "skip";
}

export function setPermissionMode(mode: PermissionMode) {
  localStorage.setItem(KEY_PERMISSION_MODE, mode);
}

export function getAllowedTools(): string[] {
  const raw = localStorage.getItem(KEY_ALLOWED_TOOLS);
  if (!raw) return [...DEFAULT_ALLOWED_TOOLS];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...DEFAULT_ALLOWED_TOOLS];
    // Validate each entry: ToolName or ToolName(scope) — no shell metacharacters.
    const valid = /^[A-Za-z]+(\([^)]+\))?$/;
    return parsed.filter((t): t is string => typeof t === "string" && valid.test(t));
  } catch {
    return [...DEFAULT_ALLOWED_TOOLS];
  }
}

export function setAllowedTools(tools: string[]) {
  localStorage.setItem(KEY_ALLOWED_TOOLS, JSON.stringify(tools));
}

export function getPermissionModeAcked(): boolean {
  return localStorage.getItem(KEY_PERMISSION_MODE_ACKED) === "true";
}

export function setPermissionModeAcked() {
  localStorage.setItem(KEY_PERMISSION_MODE_ACKED, "true");
}

export interface HarnessPermissionOverride {
  mode?: PermissionMode;
  allowedTools?: string[];
}

export function getHarnessPermissionOverrides(): Record<string, HarnessPermissionOverride> {
  const raw = localStorage.getItem(KEY_HARNESS_PERMISSION_OVERRIDES);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export function setHarnessPermissionOverrides(
  overrides: Record<string, HarnessPermissionOverride>,
) {
  localStorage.setItem(KEY_HARNESS_PERMISSION_OVERRIDES, JSON.stringify(overrides));
}

/** Clear allowed tools list, first-run ack, and per-harness overrides back to defaults.
 *  Does NOT change the selected permission mode — the user keeps their choice. */
export function resetPermissionDefaults() {
  localStorage.removeItem(KEY_ALLOWED_TOOLS);
  localStorage.removeItem(KEY_PERMISSION_MODE_ACKED);
  localStorage.removeItem(KEY_HARNESS_PERMISSION_OVERRIDES);
}

/** Whether the user has confirmed they have a qualifying plan for Auto mode. */
export function getAutoModeUnlocked(): boolean {
  return localStorage.getItem(KEY_AUTO_MODE_UNLOCKED) === "true";
}

export function setAutoModeUnlocked(unlocked: boolean) {
  if (unlocked) {
    localStorage.setItem(KEY_AUTO_MODE_UNLOCKED, "true");
  } else {
    localStorage.removeItem(KEY_AUTO_MODE_UNLOCKED);
  }
}

// ── Budget Guard ─────────────────────────────────────────────

export interface BudgetGuardConfig {
  enabled: boolean;
  dailyTokenLimit?: number;
  dailyEstimatedCostUSD?: number;
}

const BUDGET_GUARD_KEY = "harness-kit-budget-guard";

const BUDGET_GUARD_DEFAULT: BudgetGuardConfig = { enabled: false };

export function getBudgetGuard(): BudgetGuardConfig {
  const raw = localStorage.getItem(BUDGET_GUARD_KEY);
  if (!raw) return { ...BUDGET_GUARD_DEFAULT };
  try {
    return JSON.parse(raw) as BudgetGuardConfig;
  } catch {
    return { ...BUDGET_GUARD_DEFAULT };
  }
}

export function setBudgetGuard(config: BudgetGuardConfig): void {
  localStorage.setItem(BUDGET_GUARD_KEY, JSON.stringify(config));
  window.dispatchEvent(new CustomEvent("harness-kit-prefs-changed"));
}

// ── Resilience Profiles ──────────────────────────────────────

export type ResilienceProfile = "conservative" | "balanced" | "aggressive";

export interface HarnessResilienceConfig {
  /** Determines when fallback is triggered. */
  profile: ResilienceProfile;
  /** Harness ID to fall back to when the primary fails. */
  fallbackHarnessId?: string;
}

/** Per-harness config keyed by harness ID. */
export type ResilienceConfigMap = Record<string, HarnessResilienceConfig>;

const RESILIENCE_CONFIG_KEY = "harness-kit-resilience-config";

export function getResilienceConfig(): ResilienceConfigMap {
  const raw = localStorage.getItem(RESILIENCE_CONFIG_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as ResilienceConfigMap;
  } catch {
    return {};
  }
}

export function setResilienceConfig(config: ResilienceConfigMap): void {
  localStorage.setItem(RESILIENCE_CONFIG_KEY, JSON.stringify(config));
}

// ── Init ─────────────────────────────────────────────────────

/** Apply all stored preferences on boot. Call once at app startup. */
export function initPreferences() {
  setFontSize(getFontSize());
  setDensity(getDensity());
  setSidebarWidth(getSidebarWidth());
}
