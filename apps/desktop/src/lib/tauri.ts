import { invoke } from "@tauri-apps/api/core";
import type {
  InstalledPlugin, KnownMarketplace, PluginUpdateInfo, HooksConfig, StatsCache,
  SessionSummary, SessionFacet, ActiveSession, LiveDailyActivity,
  LiveStats, SessionTranscript,
  HarnessInfo,
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

export async function writeConfigFile(path: string, content: string): Promise<void> {
  return invoke<void>("write_config_file", { path, content });
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

// ── MCP commands ─────────────────────────────────────────────

export interface McpConfigResult {
  found: boolean;
  serversJson: string | null;
  source: string | null;
}

export async function readMcpConfig(): Promise<McpConfigResult> {
  return invoke<McpConfigResult>("read_mcp_config");
}

export async function writeMcpConfig(serversJson: string): Promise<string> {
  return invoke<string>("write_mcp_config", { serversJson });
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

// ── Terminal commands ───────────────────────────────────────

export async function detectHarnesses(): Promise<HarnessInfo[]> {
  return invoke<HarnessInfo[]>("detect_harnesses");
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

// ── Parity commands ──────────────────────────────────────────

export interface ParityFeature {
  name: string;
  /** Category key: "config_file" | "settings_key" | "cli_flag" | "cli_subcommand" | "mcp_transport" | "plugin_type" */
  category: string;
  /** For config files: "detected" | "not_found" | null. For other categories: null. */
  value: "detected" | "not_found" | string | null;
  knownToHarness: boolean;
}

export interface ParityDriftItem {
  id: number;
  category: string;
  featureName: string;
  /** "missing_file" — a known config file was not found on disk.
   *  "new_feature"  — a detected feature is absent from both compiled and user baselines. */
  driftType: "missing_file" | "new_feature";
  details: string | null;
  detectedAt: string;
  acknowledged: boolean;
}

export interface ParityScanResult {
  snapshotId: string;
  ccVersion: string | null;
  ccInstalled: boolean;
  featuresDetected: number;
  driftCount: number;
  driftItems: ParityDriftItem[];
  scannedAt: string;
}

export interface ParitySnapshot {
  id: string;
  timestamp: string;
  ccVersion: string | null;
  ccInstalled: boolean;
  /** Feature matrix keyed by category (e.g. "cli_flag", "settings_key"). */
  categories: Record<string, ParityFeature[]>;
}

export interface ParitySnapshotSummary {
  id: string;
  timestamp: string;
  ccVersion: string | null;
  featuresDetected: number;
  driftCount: number;
}

/** Run all parity probes and persist a new snapshot. Auto-scanned on page mount when stale. */
export async function runParityScan(): Promise<ParityScanResult> {
  return invoke<ParityScanResult>("run_parity_scan");
}

/** Return the most recent snapshot, or null if no scan has run yet. */
export async function getParitySnapshot(): Promise<ParitySnapshot | null> {
  return invoke<ParitySnapshot | null>("get_parity_snapshot");
}

/** Return drift items from the latest snapshot. Excludes acknowledged items by default. */
export async function getParityDrift(includeAcknowledged?: boolean): Promise<ParityDriftItem[]> {
  return invoke<ParityDriftItem[]>("get_parity_drift", {
    includeAcknowledged: includeAcknowledged ?? false,
  });
}

/** Mark a drift item as reviewed. Hidden from the default list; visible with includeAcknowledged. */
export async function acknowledgeDrift(driftId: number): Promise<void> {
  return invoke<void>("acknowledge_drift", { driftId });
}

/** Return up to `limit` (default 20) scan summaries, newest first. */
export async function getParityHistory(limit?: number): Promise<ParitySnapshotSummary[]> {
  return invoke<ParitySnapshotSummary[]>("get_parity_history", { limit });
}

/**
 * Create a config file at its canonical location from a built-in template.
 * Accepted names: "CLAUDE.md", "AGENT.md", "SOUL.md", ".mcp.json", ".claude/settings.json".
 * Returns the absolute path of the created file. Errors if the file already exists.
 */
export async function createConfigFile(name: string): Promise<string> {
  return invoke<string>("create_config_file", { name });
}

/**
 * Add a feature to the user-level baseline so it is no longer flagged as drift.
 * Persisted to ~/.harness-kit/parity-baseline.json and merged on each rescan.
 */
export async function addToParityBaseline(category: string, featureName: string): Promise<void> {
  return invoke<void>("add_to_parity_baseline", { category, featureName });
}

// ── Chat commands ────────────────────────────────────────────

export interface ChatRoomRow {
  code: string;
  name: string | null;
  nickname: string;
  serverUrl: string;
  joinedAt: string;
  leftAt: string | null;
}

export interface ChatMessageRow {
  id: string;
  roomCode: string;
  /** "chat" | "share" | "system" */
  msgType: string;
  nickname: string;
  timestamp: string;
  body: string | null;
  action: string | null;
  target: string | null;
  detail: string | null;
  eventType: string | null;
}

export async function chatSaveRoom(
  code: string,
  name: string | null,
  nickname: string,
  serverUrl: string,
): Promise<void> {
  return invoke<void>("chat_save_room", { code, name, nickname, serverUrl });
}

export async function chatLeaveRoom(code: string): Promise<void> {
  return invoke<void>("chat_leave_room", { code });
}

export async function chatListRooms(): Promise<ChatRoomRow[]> {
  return invoke<ChatRoomRow[]>("chat_list_rooms");
}

export async function chatSaveMessages(messages: ChatMessageRow[]): Promise<void> {
  return invoke<void>("chat_save_messages", { messages });
}

export async function chatLoadMessages(
  roomCode: string,
  limit: number,
  before?: string,
): Promise<ChatMessageRow[]> {
  return invoke<ChatMessageRow[]>("chat_load_messages", {
    roomCode,
    limit,
    before: before ?? null,
  });
}

export async function chatPurgeRoom(code: string): Promise<void> {
  return invoke<void>("chat_purge_room", { code });
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

// ── Local relay commands ─────────────────────────────────────

export function chatStartLocalRelay(port?: number): Promise<number> {
  return invoke<number>("chat_start_local_relay", { port });
}

export function chatStopLocalRelay(): Promise<void> {
  return invoke<void>("chat_stop_local_relay");
}

export function chatLocalRelayRunning(): Promise<boolean> {
  return invoke<boolean>("chat_local_relay_running");
}

// ── membrain commands ────────────────────────────────────

export async function membrainCheckInstalled(): Promise<boolean> {
  return invoke<boolean>("membrain_check_installed");
}

export async function membrainStart(port?: number): Promise<string> {
  return invoke<string>("membrain_start", { port: port ?? null });
}

export async function membrainStop(): Promise<void> {
  return invoke<void>("membrain_stop");
}

export async function membrainGetPort(): Promise<number> {
  return invoke<number>("membrain_get_port");
}
