//! Harness capability probing + drift-acknowledgement persistence.
//!
//! # History
//! This module used to run its own config-file-inspection scan (a
//! `known_features.json` baseline compared against settings.json/MCP
//! config/plugins on disk) to detect "parity drift" against Claude Code.
//! That scan is now superseded by the Drift page (`apps/desktop/src/pages/drift/`),
//! which computes drift via `packages/core`'s `detectDrift()`/`buildFixPlan()`/
//! `applyFix()` directly in the webview against the user's actual `harness.yaml`
//! — a strictly more correct and more general mechanism than a hardcoded
//! feature baseline. The config-file-inspection probes (`probe_settings_keys`,
//! `probe_mcp_config`, `probe_plugins`, `probe_config_files`, `detect_drift`,
//! and the `known_features.json` baseline merge) were removed accordingly, to
//! avoid re-implementing config parsing in Rust that core already owns.
//!
//! What remains:
//! - `probe_harness_capabilities` — CLI-binary version/availability probing
//!   (`claude --version` etc.) and capability-file existence checks. This is
//!   pure environment probing, not config parsing, so it stays.
//! - Drift-acknowledgement persistence (`acknowledge_drift_item` /
//!   `get_acknowledged_drift_items`) — SQLite-backed, keyed to core's
//!   `DriftItem` shape (scope + adapter + path + harnessName + slot) rather
//!   than the old category/feature_name/drift_type shape.

use crate::db::Db;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};
use tauri_plugin_shell::ShellExt;
use tokio::time::{timeout, Duration};

// ── Drift acknowledgement persistence ──────────────────────────
//
// Keyed by the tuple that uniquely identifies one DriftItem within one scope:
// (scope root, adapter id, project-relative path, harness name, slot). The
// Drift page computes this key client-side and treats acknowledgement as
// "hide this item until the underlying content changes again" — re-running
// detectDrift() after a genuine change produces a DriftItem that no longer
// matches any acknowledged key, so it resurfaces automatically.

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DriftAcknowledgement {
    pub scope_root: String,
    pub adapter: String,
    pub path: String,
    pub harness_name: String,
    pub slot: String,
    pub acknowledged_at: String,
}

fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339()
}

/// Acknowledge one drift item (always a `user-modified-outside` item — see
/// DESIGN.md's Drift contract: those items are never auto-fixed, only
/// acknowledged/reviewed). Upserts on the composite key.
#[tauri::command]
pub fn acknowledge_drift_item(
    db: State<'_, Db>,
    scope_root: String,
    adapter: String,
    path: String,
    harness_name: String,
    slot: String,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let acknowledged_at = now_iso();
    conn.execute(
        "INSERT INTO drift_acknowledgements \
         (scope_root, adapter, path, harness_name, slot, acknowledged_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6) \
         ON CONFLICT(scope_root, adapter, path, harness_name, slot) \
         DO UPDATE SET acknowledged_at = excluded.acknowledged_at",
        rusqlite::params![scope_root, adapter, path, harness_name, slot, acknowledged_at],
    )
    .map_err(|e| format!("Failed to acknowledge drift item: {}", e))?;
    Ok(())
}

/// Remove a previously-recorded acknowledgement (e.g. user chose "Review" again).
#[tauri::command]
pub fn unacknowledge_drift_item(
    db: State<'_, Db>,
    scope_root: String,
    adapter: String,
    path: String,
    harness_name: String,
    slot: String,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM drift_acknowledgements \
         WHERE scope_root = ?1 AND adapter = ?2 AND path = ?3 AND harness_name = ?4 AND slot = ?5",
        rusqlite::params![scope_root, adapter, path, harness_name, slot],
    )
    .map_err(|e| format!("Failed to unacknowledge drift item: {}", e))?;
    Ok(())
}

/// Return every acknowledged drift item across all scopes. The Drift page
/// filters its live `detectDrift()` results against this set client-side.
#[tauri::command]
pub fn get_acknowledged_drift_items(db: State<'_, Db>) -> Result<Vec<DriftAcknowledgement>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT scope_root, adapter, path, harness_name, slot, acknowledged_at \
             FROM drift_acknowledgements",
        )
        .map_err(|e| e.to_string())?;

    let items = stmt
        .query_map([], |row| {
            Ok(DriftAcknowledgement {
                scope_root: row.get(0)?,
                adapter: row.get(1)?,
                path: row.get(2)?,
                harness_name: row.get(3)?,
                slot: row.get(4)?,
                acknowledged_at: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(items)
}

// ── Capability probe ──────────────────────────────────────────

/// Per-harness binary check and capability file probe for the parity grid.
///
/// Each target is identified by its `TargetPlatform` id (e.g. `"claude-code"`, `"cursor"`).
/// Returns a flat map of `"targetId::capabilityId"` → `"detected" | "missing" | "not_applicable"`.
///
/// File-based capabilities (`instructions-file`, `mcp-config`, `skills-dir`, `settings-file`)
/// are probed relative to the user's home directory so the result is meaningful without
/// requiring a project directory to be set.
///
/// Only config capabilities are probed; plugin/runtime/protocol rows are returned as
/// `"not_applicable"` regardless of install state (they represent features, not files).
#[tauri::command]
pub async fn probe_harness_capabilities(
    app: AppHandle,
) -> Result<std::collections::HashMap<String, String>, String> {
    let home = dirs::home_dir().ok_or("Cannot determine home directory")?;

    type CapEntry = (&'static str, &'static str);
    type TargetEntry = (&'static str, &'static str, &'static [CapEntry]);
    // (target_id, binary_to_check, config_file_paths_by_cap_id)
    // Paths are relative to home dir for global-level checks.
    let targets: &[TargetEntry] = &[
        (
            "claude-code", "claude",
            &[
                ("instructions-file", "CLAUDE.md"),
                ("mcp-config",        ".mcp.json"),
                ("skills-dir",        ".claude/skills"),
                ("settings-file",     ".claude/settings.json"),
            ],
        ),
        (
            "cursor", "cursor-agent",
            &[
                ("instructions-file", ".cursor/rules/harness.mdc"),
                ("mcp-config",        ".cursor/mcp.json"),
                ("skills-dir",        ".cursor/skills"),
            ],
        ),
        (
            "copilot", "gh",
            &[
                ("instructions-file", ".github/copilot-instructions.md"),
                ("mcp-config",        ".vscode/mcp.json"),
                ("skills-dir",        ".github/skills"),
            ],
        ),
        (
            "codex", "codex",
            &[
                ("instructions-file", "AGENTS.md"),
                ("skills-dir",        ".agents/skills"),
            ],
        ),
        (
            "opencode", "opencode",
            &[
                ("instructions-file", "AGENTS.md"),
                ("mcp-config",        "opencode.json"),
                ("skills-dir",        ".opencode/skills"),
            ],
        ),
        (
            "windsurf", "windsurf",
            &[
                ("instructions-file", "AGENTS.md"),
                ("skills-dir",        ".windsurf/skills"),
            ],
        ),
        (
            "gemini", "gemini",
            &[
                ("instructions-file", "AGENTS.md"),
                ("mcp-config",        ".gemini/settings.json"),
                ("skills-dir",        ".gemini/skills"),
                ("settings-file",     ".gemini/settings.json"),
            ],
        ),
        (
            "junie", "junie",
            &[
                ("instructions-file", "AGENTS.md"),
                ("mcp-config",        ".junie/mcp/mcp.json"),
                ("skills-dir",        ".junie/skills"),
            ],
        ),
    ];

    // All capability IDs that are probed as files (config category)
    let config_cap_ids = &["instructions-file", "mcp-config", "skills-dir", "settings-file"];
    // Non-file capabilities (plugin/runtime/protocol) — always not_applicable
    let non_file_cap_ids = &[
        "slash-commands", "lifecycle-hooks", "subagents",
        "streaming-json", "parallel-agents",
        "mcp-stdio", "mcp-http", "mcp-sse",
    ];

    let shell = app.shell();
    let mut result: std::collections::HashMap<String, String> = std::collections::HashMap::new();

    for (target_id, binary, file_caps) in targets {
        // Check binary availability (2s timeout)
        let available = timeout(
            Duration::from_secs(2),
            shell.command(binary).args(["--version"]).output(),
        )
        .await
        .map(|r| r.is_ok_and(|o| o.status.success()))
        .unwrap_or(false);

        // Config capability file probes
        let probed_cap_ids: Vec<&str> = file_caps.iter().map(|(cap, _)| *cap).collect();
        for (cap_id, rel_path) in *file_caps {
            let key = format!("{}::{}", target_id, cap_id);
            let state = if available {
                let path = home.join(rel_path);
                if path.exists() { "detected" } else { "missing" }
            } else {
                "not_applicable"
            };
            result.insert(key, state.to_string());
        }

        // Config caps this target doesn't support → not_applicable
        for cap_id in *config_cap_ids {
            if !probed_cap_ids.contains(&cap_id) {
                result.insert(format!("{}::{}", target_id, cap_id), "not_applicable".to_string());
            }
        }

        // Non-file caps are always not_applicable (informational only)
        for cap_id in *non_file_cap_ids {
            result.insert(format!("{}::{}", target_id, cap_id), "not_applicable".to_string());
        }
    }

    Ok(result)
}
