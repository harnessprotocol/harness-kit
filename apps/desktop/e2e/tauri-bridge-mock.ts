/**
 * Injected into the browser page before load via page.addInitScript().
 * Provides a mock window.__TAURI_INTERNALS__ so invoke() works in Playwright
 * without needing the actual Tauri runtime.
 *
 * Add to MOCK_RESPONSES for any command the tests need to exercise.
 */

export const MOCK_RESPONSES: Record<string, unknown> = {
  read_harness_file: {
    found: true,
    content: 'version: "1"\nmetadata:\n  name: test-harness\n',
    path: "~/.claude/harness.yaml",
  },
  scan_claude_config: {
    mcpServersJson: JSON.stringify({
      mcpServers: {
        tauri: { command: "tauri-mcp" },
        grafana: { command: "grafana-mcp" },
      },
    }),
    settingsJson: JSON.stringify({
      permissions: { allow: Array(16).fill("Bash") },
    }),
    mcpSource: "~/.claude/mcp.json",
    settingsSource: "~/.claude/settings.local.json",
  },
  list_installed_plugins: [],
  check_plugin_updates: [],
  list_marketplaces: [],
  read_plugin_tree: { name: "root", children: [], files: [] },
  list_sessions_summary: [],
  read_stats_cache: null,
  read_live_activity: [],
  list_active_sessions: [],
  detect_harnesses: [
    { id: "claude", name: "Claude Code", command: "claude", available: true, version: "1.5.0", mode: "supported" },
    { id: "gh-copilot", name: "GitHub Copilot", command: "copilot", available: true, version: "1.0.0", mode: "supported" },
    { id: "cursor", name: "Cursor", command: "cursor", available: false },
  ],
  list_comparisons: [
    {
      id: "mock-cmp-1",
      prompt: "write a hello world function",
      workingDir: "/tmp/project",
      pinnedCommit: null,
      createdAt: new Date(Date.now() - 3_600_000).toISOString(),
      status: "complete",
      panels: [
        { id: "panel-1", harnessId: "claude", harnessName: "Claude Code", model: "claude-sonnet-4-6", exitCode: 0, durationMs: 4200, status: "complete" },
        { id: "panel-2", harnessId: "gh-copilot", harnessName: "GitHub Copilot", model: "gpt-4o", exitCode: 0, durationMs: 3800, status: "complete" },
      ],
    },
    {
      id: "mock-cmp-2",
      prompt: "refactor the auth module",
      workingDir: "/tmp/project",
      pinnedCommit: "abc1234",
      createdAt: new Date(Date.now() - 86_400_000).toISOString(),
      status: "complete",
      panels: [
        { id: "panel-3", harnessId: "claude", harnessName: "Claude Code", model: "claude-opus-4-6", exitCode: 0, durationMs: 12000, status: "complete" },
      ],
    },
  ],
  delete_comparison: null,
  start_comparison: null,
  kill_panel: null,
  check_git_repo: { isGitRepo: false, branch: null, currentCommit: null },
  get_comparison_setup: { prompt: "", workingDir: "", panels: [] },
  read_permissions: { allow: [], deny: [], ask: [], tools: { allow: [], deny: [], ask: [] }, paths: { writable: [], readonly: [] }, network: { allowedHosts: [] } },
  list_security_presets: [],
  list_required_env: [],
  list_audit_entries: [],
  board_server_check_installed: false,
  read_env_config: [],
  get_comparator_analytics: { totalComparisons: 0, totalPanels: 0 },
  get_evaluation_session: null,
  create_evaluation_session: {
    id: "mock-session-1",
    comparisonId: "mock-cmp-1",
    evalMethod: "pairwise",
    blindOrder: "panel-2,panel-1",
    revealedAt: null,
    createdAt: new Date().toISOString(),
  },
  reveal_evaluation_session: null,
  save_pairwise_vote: null,
  get_pairwise_votes: [],
  get_pairwise_analytics: {
    totalVotes: 0,
    eloRankings: [],
    dimensionWinRates: [],
  },
  sync_list_backups: [],
  // Parity
  get_parity_snapshot: {
    id: "mock-snapshot-1",
    timestamp: new Date(Date.now() - 60_000).toISOString(),
    ccVersion: "1.2.3",
    ccInstalled: true,
    categories: {
      cli_flag: [
        { name: "--version", category: "cli_flag", value: null, knownToHarness: true },
        { name: "--help", category: "cli_flag", value: null, knownToHarness: true },
      ],
      settings_key: [
        { name: "permissions.allow", category: "settings_key", value: null, knownToHarness: true },
        { name: "someNewKey", category: "settings_key", value: null, knownToHarness: false },
      ],
      config_file: [
        { name: "CLAUDE.md", category: "config_file", value: "detected", knownToHarness: true },
        { name: "AGENT.md", category: "config_file", value: "not_found", knownToHarness: true },
      ],
    },
  },
  get_parity_drift: [
    {
      id: 1,
      category: "settings_key",
      featureName: "someNewKey",
      driftType: "new_feature",
      details: "Key 'someNewKey' found in settings.json but not tracked",
      detectedAt: new Date(Date.now() - 60_000).toISOString(),
      acknowledged: false,
    },
    {
      id: 2,
      category: "config_file",
      featureName: "AGENT.md",
      driftType: "missing_file",
      details: "AGENT.md is expected but not found",
      detectedAt: new Date(Date.now() - 60_000).toISOString(),
      acknowledged: false,
    },
  ],
  run_parity_scan: {
    snapshotId: "mock-snapshot-1",
    ccVersion: "1.2.3",
    ccInstalled: true,
    featuresDetected: 6,
    driftCount: 2,
    driftItems: [],
    scannedAt: new Date().toISOString(),
  },
  get_parity_history: [],
  acknowledge_drift: null,
  create_config_file: "/home/user/AGENT.md",
  add_to_parity_baseline: null,
  // Chat
  chat_save_room: null,
  chat_leave_room: null,
  chat_list_rooms: [],
  chat_save_messages: null,
  chat_load_messages: [],
  chat_purge_room: null,
};

/**
 * Script string to inject. Call addInitScript with this.
 * Must be self-contained (no imports).
 */
export function buildBridgeScript(responses: Record<string, unknown>): string {
  return `
    (function() {
      const RESPONSES = ${JSON.stringify(responses)};

      window.__TAURI_INTERNALS__ = {
        invoke: function(cmd, args) {
          return new Promise(function(resolve, reject) {
            const response = RESPONSES[cmd];
            if (response !== undefined) {
              setTimeout(function() { resolve(response); }, 0);
            } else {
              setTimeout(function() {
                reject('Mock: no response registered for command: ' + cmd);
              }, 0);
            }
          });
        },
        listen: function(event, handler) {
          return Promise.resolve(function() {});
        },
        transformCallback: function(handler, once) {
          return 0;
        },
      };

      window.__TAURI__ = { invoke: window.__TAURI_INTERNALS__.invoke };
    })();
  `;
}
