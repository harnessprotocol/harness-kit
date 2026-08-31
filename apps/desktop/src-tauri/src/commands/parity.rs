//! Drift-acknowledgement persistence.
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
//! The `probe_harness_capabilities` CLI-binary/capability-file probe was
//! removed too once its last consumer (the retired parity grid) was gone —
//! surface detection is now core's descriptor-driven observation, run in
//! the webview by the Machine page.
//!
//! What remains:
//! - Drift-acknowledgement persistence (`acknowledge_drift_item` /
//!   `get_acknowledged_drift_items`) — SQLite-backed, keyed to core's
//!   `DriftItem` shape (scope + adapter + path + harnessName + slot) rather
//!   than the old category/feature_name/drift_type shape.

use crate::db::Db;
use serde::{Deserialize, Serialize};
use tauri::State;

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
