import { invoke } from "@tauri-apps/api/core";
import type {
  InstalledPlugin, KnownMarketplace, PluginUpdateInfo, HooksConfig, StatsCache,
  SessionSummary, SessionFacet, ActiveSession, LiveDailyActivity,
  LiveStats, SessionTranscript,
  HarnessInfo,
  PermissionsState, SecurityPreset, KeychainSecretInfo,
  EnvConfigEntry, AuditEntry, FileTreeNode,
  ComparisonSummary, ComparisonDetail, FileDiffInput, FileDiffRow,
} from "@harness-kit/shared";

export const DESKTOP_RUNTIME_UNAVAILABLE_MESSAGE =
  "Browser preview mode: filesystem actions require the Harness Kit desktop runtime.";

export function isTauriRuntimeAvailable(): boolean {
  return typeof window !== "undefined" && !!(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
}

// ── Plugin commands ──────────────────────────────────────────

export async function listInstalledPlugins(): Promise<InstalledPlugin[]> {
  return invoke<InstalledPlugin[]>("list_installed_plugins");
}

export async function listMarketplaces(): Promise<KnownMarketplace[]> {
  return invoke<KnownMarketplace[]>("list_marketplaces");
}

export async function checkPluginUpdates(): Promise<PluginUpdateInfo[]> {
  return invoke<PluginUpdateInfo[]>("check_plugin_updates");
}

export async function uninstallPlugin(name: string): Promise<void> {
  return invoke<void>("uninstall_plugin", { name });
}

// ── Plugin Explorer commands ────────────────────────────────

export async function readPluginTree(pluginPath: string): Promise<FileTreeNode> {
  return invoke<FileTreeNode>("read_plugin_tree", { pluginPath });
}

export async function readPluginFile(filePath: string): Promise<string> {
  return invoke<string>("read_plugin_file", { filePath });
}

/** `expectedSha256`: digest of what the page loaded (`loadedDigest`); omit when the file was new. */
export async function writePluginFile(
  filePath: string,
  content: string,
  expectedSha256?: string,
): Promise<void> {
  return invoke<void>("write_plugin_file", { filePath, content, expectedSha256 });
}

/**
 * Rust opens the folder dialog when `sourcePath` is null (resolves null on
 * cancel). A string must be a path the user dropped on the window; Rust
 * refuses any other, so the webview cannot name a folder of its own.
 */
export async function importPluginFromPath(sourcePath: string | null): Promise<InstalledPlugin | null> {
  return invoke<InstalledPlugin | null>("import_plugin_from_path", { sourcePath });
}

/** Same rule as importPluginFromPath, with a zip dialog when `zipPath` is null. */
export async function importPluginFromZip(zipPath: string | null): Promise<InstalledPlugin | null> {
  return invoke<InstalledPlugin | null>("import_plugin_from_zip", { zipPath });
}

/** Rust opens the save dialog; the webview never names the destination. Resolves false on cancel. */
export async function exportPluginAsZip(pluginPath: string): Promise<boolean> {
  return invoke<boolean>("export_plugin_as_zip", { pluginPath });
}

/** Rust opens the folder dialog; the webview never names the destination. Resolves false on cancel. */
export async function exportPluginToFolder(pluginPath: string): Promise<boolean> {
  return invoke<boolean>("export_plugin_to_folder", { pluginPath });
}

/** The full `name@marketplace` `installed_plugins.json` key; Rust refuses a bare name on uninstall. */
export function pluginKey(plugin: { name: string; marketplace?: string }): string {
  return plugin.marketplace ? `${plugin.name}@${plugin.marketplace}` : plugin.name;
}

// ── File History commands ───────────────────────────────────

export interface HistoryEntry {
  timestamp: string;
  content: string;
}

export async function readFileHistory(pluginName: string, filePath: string): Promise<HistoryEntry[]> {
  return invoke<HistoryEntry[]>("read_file_history", { pluginName, filePath });
}

export async function pushFileHistory(pluginName: string, filePath: string, content: string): Promise<void> {
  return invoke<void>("push_file_history", { pluginName, filePath, content });
}

export async function getHistorySize(): Promise<number> {
  return invoke<number>("get_history_size");
}

// ── Hook commands ────────────────────────────────────────────

export async function readHooks(): Promise<HooksConfig> {
  return invoke<HooksConfig>("read_hooks");
}

// ── Claude.md commands ───────────────────────────────────────

export async function readClaudeMd(path: string): Promise<string> {
  return invoke<string>("read_claude_md", { path });
}

/** `expectedSha256`: digest of what the page loaded (`loadedDigest`); omit when the file must not exist. */
export async function writeConfigFile(
  path: string,
  content: string,
  expectedSha256?: string,
): Promise<void> {
  return invoke<void>("write_config_file", { path, content, expectedSha256 });
}

// ── Harness File commands ─────────────────────────────────────

export interface HarnessFileResult {
  found: boolean;
  content: string | null;
  path: string | null;
  /** A file sits at ~/harness.yaml and none at ~/.claude/harness.yaml. Existence only; never read. */
  legacy_home_file?: boolean;
}

export async function readHarnessFile(): Promise<HarnessFileResult> {
  return invoke<HarnessFileResult>("read_harness_file");
}

/** `expectedSha256`: digest of the loaded ~/.claude/harness.yaml (`loadedDigest`); omit when it did not exist. */
export async function writeHarnessFile(content: string, expectedSha256?: string): Promise<string> {
  return invoke<string>("write_harness_file", { content, expectedSha256 });
}

/**
 * Share (AC-25): Rust opens the native Save dialog and writes `contents` to
 * the path the user picks. The page never names the path. Resolves the saved
 * path, or null when the user cancels.
 */
export async function saveShareFile(
  kind: "harness-yaml" | "agent-prompt",
  suggestedName: string,
  contents: string,
): Promise<string | null> {
  return invoke<string | null>("save_share_file", { kind, suggestedName, contents });
}

// ── Custom Profile commands ───────────────────────────────────

export interface CustomProfile {
  id: string;
  name: string;
  description: string;
}

export async function listCustomProfiles(): Promise<CustomProfile[]> {
  return invoke<CustomProfile[]>("list_custom_profiles");
}

export async function getCustomProfile(id: string): Promise<string> {
  return invoke<string>("get_custom_profile", { id });
}

export async function saveCustomProfile(id: string, content: string): Promise<string> {
  return invoke<string>("save_custom_profile", { id, content });
}

export async function deleteCustomProfile(id: string): Promise<void> {
  return invoke<void>("delete_custom_profile", { id });
}

// ── Settings / directory commands ────────────────────────────

export interface ClaudeAccountInfo {
  logged_in: boolean;
  subscription_type: string | null;
  auto_mode_available: boolean;
}

export async function detectClaudeAccount(): Promise<ClaudeAccountInfo> {
  return invoke<ClaudeAccountInfo>("detect_claude_account");
}

export async function listClaudeDir(): Promise<string[]> {
  return invoke<string[]>("list_claude_dir");
}

// ── Observatory commands ──────────────────────────────────────

export async function readStatsCache(): Promise<StatsCache> {
  return invoke<StatsCache>("read_stats_cache");
}

export async function listSessionsSummary(): Promise<SessionSummary[]> {
  return invoke<SessionSummary[]>("list_sessions_summary");
}

export async function readSessionFacet(sessionId: string): Promise<SessionFacet | null> {
  return invoke<SessionFacet | null>("read_session_facet", { sessionId });
}

export async function listActiveSessions(): Promise<ActiveSession[]> {
  return invoke<ActiveSession[]>("list_active_sessions");
}

export async function readLiveActivity(): Promise<LiveDailyActivity[]> {
  return invoke<LiveDailyActivity[]>("read_live_activity");
}

export async function computeLiveStats(sinceDate?: string): Promise<LiveStats> {
  return invoke<LiveStats>("compute_live_stats", { sinceDate: sinceDate ?? null });
}

export async function readSessionTranscript(sessionId: string, project: string): Promise<SessionTranscript> {
  return invoke<SessionTranscript>("read_session_transcript", { sessionId, project });
}

// ── Harness detection (used by Parity) ───────────────────────

export async function detectHarnesses(): Promise<HarnessInfo[]> {
  return invoke<HarnessInfo[]>("detect_harnesses");
}

/**
 * Extend the Tauri FS plugin's runtime scope to cover a user-chosen project
 * directory, in-memory for this app session. The static capability
 * (capabilities/default.json) only lists known harness config roots under
 * $HOME — it never grants a blanket $HOME/** scope — so callers that need
 * TauriFsProvider access to an arbitrary project dir (Machine, Drift, Profile) must
 * grant it here first.
 */
export async function grantProjectScope(path: string): Promise<void> {
  return invoke<void>("grant_project_scope", { path });
}

// ── Security commands ───────────────────────────────────────

/** The permissions plus `sha256`, the digest of the settings.json they were read from. */
export type PermissionsRead = PermissionsState & { sha256: string };

export async function readPermissions(): Promise<PermissionsRead> {
  return invoke<PermissionsRead>("read_permissions");
}

/**
 * Save edited permissions. `expectedSha256` is the `sha256` from the read the
 * edits started from; the save is refused if settings.json changed since.
 * Resolves to the digest of the file as written.
 */
export async function updatePermissions(
  permissions: PermissionsState,
  expectedSha256?: string,
): Promise<string> {
  return invoke<string>("update_permissions", { permissions, expectedSha256 });
}

export async function listSecurityPresets(): Promise<SecurityPreset[]> {
  return invoke<SecurityPreset[]>("list_security_presets");
}

export interface PresetOutcome {
  /** False when nothing was written because deny rules need confirmation. */
  applied: boolean;
  droppedDeny: string[];
}

/**
 * Merge a preset into settings.json. `expectedSha256` is the digest from the
 * last `readPermissions`. `confirmedDropDeny` is the exact `droppedDeny` list
 * a previous call returned and the user agreed to; the call is refused if the
 * deny rules the preset would now remove are not exactly that list.
 */
export async function applySecurityPreset(
  presetId: string,
  expectedSha256?: string,
  confirmedDropDeny?: string[],
): Promise<PresetOutcome> {
  return invoke<PresetOutcome>("apply_security_preset", {
    presetId,
    expectedSha256,
    confirmedDropDeny,
  });
}

export async function listRequiredEnv(): Promise<KeychainSecretInfo[]> {
  return invoke<KeychainSecretInfo[]>("list_required_env");
}

export async function setKeychainSecret(name: string, value: string): Promise<void> {
  return invoke<void>("set_keychain_secret", { name, value });
}

export async function deleteKeychainSecret(name: string): Promise<void> {
  return invoke<void>("delete_keychain_secret", { name });
}

/** The env entries plus `sha256`, the digest of the env.json they were read from ("absent" if none). */
export interface EnvConfigRead {
  entries: EnvConfigEntry[];
  sha256: string;
}

export async function readEnvConfig(): Promise<EnvConfigRead> {
  return invoke<EnvConfigRead>("read_env_config");
}

/** `expectedSha256`: the `sha256` of the read the edits started from. Resolves to the digest as written. */
export async function writeEnvConfig(
  entries: EnvConfigEntry[],
  expectedSha256?: string,
): Promise<string> {
  return invoke<string>("write_env_config", { entries, expectedSha256 });
}

export async function listAuditEntries(
  limit: number, offset: number, category?: string,
): Promise<AuditEntry[]> {
  return invoke<AuditEntry[]>("list_audit_entries", { limit, offset, category });
}

export async function clearAuditEntries(beforeDate: string): Promise<void> {
  return invoke<void>("clear_audit_entries", { beforeDate });
}

// ── Changes (Settings > Activity) ────────────────────────────

/** One change the app made, from the rollback ledger. */
export interface ChangeEntry {
  transactionId: string;
  appliedAt: string;
  surfaces: string[];
  kinds: string[];
  identityKeys: string[];
  /** Home-relative paths the change touched. */
  files: string[];
  /** The surface a Machine copy came from, when the change was one. */
  copiedFrom: string | null;
  status: "applied" | "undone" | "unavailable";
  undoable: boolean;
  /** Why Undo is not offered, in words for the user. */
  reason: string | null;
}

export interface UndoOutcome {
  transactionId: string;
  files: string[];
  /** Set when the files were restored but the change was not marked undone. */
  warning: string | null;
}

/** Recent changes, newest first. Read-only. */
export async function listChanges(limit?: number): Promise<ChangeEntry[]> {
  return invoke<ChangeEntry[]>("list_changes", { limit });
}

/**
 * Undo one change by id. Rust looks up the change, verifies every file still
 * holds what the change left, and restores the previous content; the webview
 * supplies nothing but the id.
 */
export async function undoChange(transactionId: string): Promise<UndoOutcome> {
  return invoke<UndoOutcome>("undo_change", { transactionId });
}

// ── Sync commands ────────────────────────────────────────────

export interface SyncFileWrite {
  relativePath: string;
  content: string;
}

export interface BackupFileEntry {
  relativePath: string;
  existed: boolean;
  sizeBytes: number;
}

export interface BackupManifest {
  id: string;
  timestamp: string;
  projectDir: string;
  harnessName: string;
  platforms: string[];
  files: BackupFileEntry[];
}

export async function syncReadFile(projectDir: string, filePath: string): Promise<string> {
  return invoke<string>("sync_read_file", { projectDir, filePath });
}

export async function syncFileExists(projectDir: string, filePath: string): Promise<boolean> {
  return invoke<boolean>("sync_file_exists", { projectDir, filePath });
}

export async function syncReadDir(projectDir: string, dirPath: string): Promise<string[]> {
  return invoke<string[]>("sync_read_dir", { projectDir, dirPath });
}

export async function syncWriteFiles(projectDir: string, files: SyncFileWrite[]): Promise<void> {
  return invoke<void>("sync_write_files", { projectDir, files });
}

export async function syncCreateBackup(
  projectDir: string,
  harnessName: string,
  platforms: string[],
  filePaths: string[],
): Promise<BackupManifest> {
  return invoke<BackupManifest>("sync_create_backup", { projectDir, harnessName, platforms, filePaths });
}

export async function syncListBackups(): Promise<BackupManifest[]> {
  return invoke<BackupManifest[]>("sync_list_backups");
}

export async function syncRestoreBackup(backupId: string): Promise<void> {
  return invoke<void>("sync_restore_backup", { backupId });
}

// ── Drift acknowledgement persistence (used by the Drift page) ──
//
// Drift itself is computed live in the webview via @harness-kit/core's
// detectDrift()/buildFixPlan()/applyFix() — these commands only persist
// which specific items the user has acknowledged/reviewed (always
// `user-modified-outside` items, which are never auto-fixed).

export interface DriftAcknowledgement {
  scopeRoot: string;
  adapter: string;
  path: string;
  harnessName: string;
  slot: string;
  acknowledgedAt: string;
}

/**
 * Drift acknowledgements now live in the SHARED ~/.harness/harness.db
 * alongside the rollback ledger (AC-37), not in the desktop's private
 * comparator.db. `migrateDriftAcknowledgements` copies anything the old
 * database still holds; it is idempotent and never deletes the source, so
 * calling it on every mount is safe and cheap.
 */
export async function migrateDriftAcknowledgements(legacyDb: string): Promise<number> {
  return invoke<number>("migrate_drift_acknowledgements", { legacyDb });
}

export async function acknowledgeDriftItem(key: {
  scopeRoot: string;
  adapter: string;
  path: string;
  harnessName: string;
  slot: string;
}): Promise<void> {
  return invoke<void>("acknowledge_drift", {
    ack: { ...key, acknowledgedAt: new Date().toISOString() },
  });
}

export async function unacknowledgeDriftItem(key: {
  scopeRoot: string;
  adapter: string;
  path: string;
  harnessName: string;
  slot: string;
}): Promise<void> {
  return invoke<void>("unacknowledge_drift", {
    ack: { ...key, acknowledgedAt: "" },
  });
}

export async function getAcknowledgedDriftItems(): Promise<DriftAcknowledgement[]> {
  return invoke<DriftAcknowledgement[]>("list_drift_acknowledgements");
}

// ── Comparator session commands ─────────────────────────────

export async function saveComparison(
  id: string,
  title: string | null,
  prompt: string,
  workingDir: string,
  pinnedCommit: string | null,
): Promise<void> {
  return invoke<void>("save_comparison", { id, title, prompt, workingDir, pinnedCommit });
}

export async function updateComparisonTitle(id: string, title: string): Promise<void> {
  return invoke<void>("update_comparison_title", { id, title });
}

export async function updateComparisonStatus(id: string, status: string): Promise<void> {
  return invoke<void>("update_comparison_status", { id, status });
}

export async function listComparisons(
  limit?: number,
  offset?: number,
): Promise<ComparisonSummary[]> {
  return invoke<ComparisonSummary[]>("list_comparisons", { limit: limit ?? 50, offset: offset ?? 0 });
}

export async function getComparison(id: string): Promise<ComparisonDetail | null> {
  return invoke<ComparisonDetail | null>("get_comparison", { id });
}

export async function deleteComparison(id: string): Promise<void> {
  return invoke<void>("delete_comparison", { id });
}

// ── Comparator panel commands ───────────────────────────────

export async function savePanel(
  id: string,
  comparisonId: string,
  harnessId: string,
  harnessName: string,
  model: string | null,
): Promise<void> {
  return invoke<void>("save_panel", { id, comparisonId, harnessId, harnessName, model });
}

export async function updatePanelResult(
  comparisonId: string,
  panelId: string,
  exitCode: number,
  durationMs: number,
  status: string,
): Promise<void> {
  return invoke<void>("update_panel_result", { comparisonId, panelId, exitCode, durationMs, status });
}

export async function saveFileDiffs(
  comparisonId: string,
  panelId: string,
  diffs: FileDiffInput[],
): Promise<void> {
  return invoke<void>("save_file_diffs", { comparisonId, panelId, diffs });
}

export async function getComparisonDiffs(comparisonId: string): Promise<FileDiffRow[]> {
  return invoke<FileDiffRow[]>("get_comparison_diffs", { comparisonId });
}

export async function getPanelDiffs(
  comparisonId: string,
  panelId: string,
): Promise<FileDiffRow[]> {
  return invoke<FileDiffRow[]>("get_panel_diffs", { comparisonId, panelId });
}

// ── Feedback commands ─────────────────────────────────────────

export interface SystemInfo {
  os: string;
  osVersion: string;
  arch: string;
  appVersion: string;
}

export interface FeedbackResult {
  success: boolean;
  issueUrl: string | null;
  error: string | null;
}

export async function getSystemInfo(): Promise<SystemInfo> {
  return invoke<SystemInfo>("get_system_info");
}

export async function submitFeedback(
  category: string,
  title: string,
  description: string,
  sysInfo: SystemInfo,
): Promise<FeedbackResult> {
  return invoke<FeedbackResult>("submit_feedback", {
    category,
    title,
    description,
    os: sysInfo.os,
    osVersion: sysInfo.osVersion,
    arch: sysInfo.arch,
    appVersion: sysInfo.appVersion,
  });
}
