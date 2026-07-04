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
  // Shape must match HarnessInfo (@harness-kit/shared): models[] + authenticated required.
  detect_harnesses: [
    { id: "claude", name: "Claude Code", command: "claude", available: true, authenticated: true, version: "1.5.0", mode: "supported", models: ["claude-sonnet-4-6", "claude-opus-4-6"], defaultModel: "claude-sonnet-4-6" },
    { id: "gh-copilot", name: "GitHub Copilot", command: "copilot", available: true, authenticated: true, version: "1.0.0", mode: "supported", models: ["gpt-4o"], defaultModel: "gpt-4o" },
    { id: "cursor", name: "Cursor", command: "cursor", available: false, authenticated: false, models: [] },
  ],
  get_harness_recommendations: [],
  tag_comparison_task_type: null,
  // Shape must match ComparisonSummary (@harness-kit/shared): flat harnessNames +
  // panelCount + title, as serialized by the Rust list_comparisons command.
  list_comparisons: [
    {
      id: "mock-cmp-1",
      title: null,
      prompt: "write a hello world function",
      workingDir: "/tmp/project",
      pinnedCommit: null,
      createdAt: new Date(Date.now() - 3_600_000).toISOString(),
      status: "complete",
      panelCount: 2,
      harnessNames: ["Claude Code", "GitHub Copilot"],
    },
    {
      id: "mock-cmp-2",
      title: "Auth refactor A/B",
      prompt: "refactor the auth module",
      workingDir: "/tmp/project",
      pinnedCommit: "abc1234",
      createdAt: new Date(Date.now() - 86_400_000).toISOString(),
      status: "complete",
      panelCount: 1,
      harnessNames: ["Claude Code"],
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
  // Drift (capability probing + acknowledgement persistence — drift itself
  // is computed by @harness-kit/core against the mocked FsProvider, not IPC)
  probe_harness_capabilities: {},
  acknowledge_drift_item: null,
  unacknowledge_drift_item: null,
  get_acknowledged_drift_items: [],
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
