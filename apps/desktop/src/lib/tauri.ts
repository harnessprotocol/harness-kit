import { invoke } from "@tauri-apps/api/core";
import type {
  InstalledPlugin, KnownMarketplace, PluginUpdateInfo, HooksConfig, StatsCache,
  SessionSummary, SessionFacet, ActiveSession, LiveDailyActivity,
  HarnessInfo, ComparisonRequest, GitRepoInfo, ComparisonSummary,
  ComparisonDetail, PanelDiffs, ReplaySetup, SaveEvaluationRequest,
  EvaluationScores, AnalyticsData, FileDiffEntry,
  PermissionsState, SecurityPreset, KeychainSecretInfo,
  EnvConfigEntry, AuditEntry, FileTreeNode,
} from "@harness-kit/shared";

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

export async function writePluginFile(filePath: string, content: string): Promise<void> {
  return invoke<void>("write_plugin_file", { filePath, content });
}

export async function importPluginFromPath(sourcePath: string): Promise<InstalledPlugin> {
  return invoke<InstalledPlugin>("import_plugin_from_path", { sourcePath });
}

export async function importPluginFromZip(zipPath: string): Promise<InstalledPlugin> {
  return invoke<InstalledPlugin>("import_plugin_from_zip", { zipPath });
}

export async function exportPluginAsZip(pluginPath: string, savePath: string): Promise<void> {
  return invoke<void>("export_plugin_as_zip", { pluginPath, savePath });
}

export async function exportPluginToFolder(pluginPath: string, dest: string): Promise<void> {
  return invoke<void>("export_plugin_to_folder", { pluginPath, dest });
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

// ── Harness File commands ─────────────────────────────────────

export interface HarnessFileResult {
  found: boolean;
  content: string | null;
  path: string | null;
}

export async function readHarnessFile(): Promise<HarnessFileResult> {
  return invoke<HarnessFileResult>("read_harness_file");
}

export async function writeHarnessFile(content: string): Promise<string> {
  return invoke<string>("write_harness_file", { content });
}

export interface ClaudeConfigScan {
  mcpServersJson: string | null;
  settingsJson: string | null;
  mcpSource: string | null;
  settingsSource: string | null;
}

export async function scanClaudeConfig(): Promise<ClaudeConfigScan> {
  return invoke<ClaudeConfigScan>("scan_claude_config");
}

// ── Settings / directory commands ────────────────────────────

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

// ── Comparator commands ─────────────────────────────────────

export async function detectHarnesses(): Promise<HarnessInfo[]> {
  return invoke<HarnessInfo[]>("detect_harnesses");
}

export async function startComparison(request: ComparisonRequest): Promise<void> {
  return invoke<void>("start_comparison", { request });
}

export async function killPanel(comparisonId: string, panelId: string): Promise<void> {
  return invoke<void>("kill_panel", { comparisonId, panelId });
}

// ── Git commands ────────────────────────────────────────────

export async function checkGitRepo(dir: string): Promise<GitRepoInfo> {
  return invoke<GitRepoInfo>("check_git_repo", { dir });
}

export async function createWorktrees(
  repoDir: string, comparisonId: string, panelIds: string[], commit: string,
): Promise<Array<{ panelId: string; worktreePath: string }>> {
  return invoke("create_worktrees", { repoDir, comparisonId, panelIds, commit });
}

export async function removeWorktrees(repoDir: string, comparisonId: string): Promise<void> {
  return invoke<void>("remove_worktrees", { repoDir, comparisonId });
}

export async function getDiffAgainstCommit(
  worktreePath: string, baseCommit: string,
): Promise<FileDiffEntry[]> {
  return invoke("get_diff_against_commit", { worktreePath, baseCommit });
}

// ── Persistence commands ────────────────────────────────────

interface SavePanelRequest {
  id: string;
  harnessId: string;
  harnessName: string;
  model?: string;
}

export async function saveComparison(
  id: string, prompt: string, workingDir: string,
  pinnedCommit: string | null, panels: SavePanelRequest[],
): Promise<void> {
  return invoke<void>("save_comparison", { id, prompt, workingDir, pinnedCommit, panels });
}

export async function savePanelResult(
  comparisonId: string, panelId: string,
  exitCode: number | null, durationMs: number | null,
  status: string, outputText: string | null,
): Promise<void> {
  return invoke<void>("save_panel_result", {
    comparisonId, panelId, exitCode, durationMs, status, outputText,
  });
}

export async function listComparisons(
  limit?: number, offset?: number,
): Promise<ComparisonSummary[]> {
  return invoke<ComparisonSummary[]>("list_comparisons", { limit, offset });
}

export async function getComparison(comparisonId: string): Promise<ComparisonDetail> {
  return invoke<ComparisonDetail>("get_comparison", { comparisonId });
}

export async function deleteComparison(comparisonId: string): Promise<void> {
  return invoke<void>("delete_comparison", { comparisonId });
}

export async function saveFileDiffs(
  comparisonId: string, panelId: string,
  diffs: Array<{ filePath: string; diffText: string; changeType: string }>,
): Promise<void> {
  return invoke<void>("save_file_diffs", { comparisonId, panelId, diffs });
}

export async function getComparisonDiffs(comparisonId: string): Promise<PanelDiffs[]> {
  return invoke<PanelDiffs[]>("get_comparison_diffs", { comparisonId });
}

export async function getComparisonSetup(comparisonId: string): Promise<ReplaySetup> {
  return invoke<ReplaySetup>("get_comparison_setup", { comparisonId });
}

// ── Evaluation commands ─────────────────────────────────────

export async function saveEvaluation(evaluation: SaveEvaluationRequest): Promise<void> {
  return invoke<void>("save_evaluation", { ...evaluation });
}

export async function getEvaluations(comparisonId: string): Promise<EvaluationScores[]> {
  return invoke<EvaluationScores[]>("get_evaluations", { comparisonId });
}

export async function updateEvaluationScore(
  evaluationId: string, dimension: string, score: number,
): Promise<void> {
  return invoke<void>("update_evaluation_score", { evaluationId, dimension, score });
}

// ── Export commands ──────────────────────────────────────────

export async function exportComparisonJson(comparisonId: string): Promise<string> {
  return invoke<string>("export_comparison_json", { comparisonId });
}

// ── Analytics commands ──────────────────────────────────────

export async function getComparatorAnalytics(): Promise<AnalyticsData> {
  return invoke<AnalyticsData>("get_comparator_analytics");
}

// ── Security commands ───────────────────────────────────────

export async function readPermissions(): Promise<PermissionsState> {
  return invoke<PermissionsState>("read_permissions");
}

export async function updatePermissions(permissions: PermissionsState): Promise<void> {
  return invoke<void>("update_permissions", { permissions });
}

export async function listSecurityPresets(): Promise<SecurityPreset[]> {
  return invoke<SecurityPreset[]>("list_security_presets");
}

export async function applySecurityPreset(presetId: string): Promise<void> {
  return invoke<void>("apply_security_preset", { presetId });
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

export async function readEnvConfig(): Promise<EnvConfigEntry[]> {
  return invoke<EnvConfigEntry[]>("read_env_config");
}

export async function writeEnvConfig(entries: EnvConfigEntry[]): Promise<void> {
  return invoke<void>("write_env_config", { entries });
}

export async function listAuditEntries(
  limit: number, offset: number, category?: string,
): Promise<AuditEntry[]> {
  return invoke<AuditEntry[]>("list_audit_entries", { limit, offset, category });
}

export async function clearAuditEntries(beforeDate: string): Promise<void> {
  return invoke<void>("clear_audit_entries", { beforeDate });
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

// ── Board server commands ──────────────────────────────────

export async function boardServerCheckInstalled(): Promise<boolean> {
  return invoke<boolean>("board_server_check_installed");
}

export async function boardServerInstall(): Promise<string> {
  return invoke<string>("board_server_install");
}

export async function boardServerStart(): Promise<string> {
  return invoke<string>("board_server_start");
}

export async function boardServerRestart(): Promise<string> {
  return invoke<string>("board_server_restart");
}
