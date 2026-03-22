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
  detect_harnesses: [],
  list_comparisons: [],
  read_permissions: { allow: [], deny: [], ask: [], tools: { allow: [], deny: [], ask: [] }, paths: { writable: [], readonly: [] }, network: { allowedHosts: [] } },
  list_security_presets: [],
  list_required_env: [],
  list_audit_entries: [],
  board_server_check_installed: false,
  read_env_config: [],
  get_comparator_analytics: { totalComparisons: 0, totalPanels: 0 },
  sync_list_backups: [],
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
