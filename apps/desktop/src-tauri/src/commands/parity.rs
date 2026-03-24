//! Parity scanner — detects Claude Code features installed on the user's machine and compares
//! them against Harness Kit's known-feature baseline to surface drift.
//!
//! # Baselines
//!
//! Two files define what Harness Kit "knows" about Claude Code:
//!
//! ## Compiled baseline — `src/parity/known_features.json`
//! Embedded at compile time via `include_str!()`. Lists the config files, settings keys,
//! CLI flags, MCP transports, and plugin component types that Harness Kit explicitly supports.
//! **Update this file** whenever you add support for a new Claude Code feature in the
//! compile pipeline (packages/core/). Changing it clears existing drift for that feature.
//!
//! ## User baseline — `~/.harness-kit/parity-baseline.json`
//! Created automatically when the user clicks "Mark as Known" in the dashboard.
//! Augments the compiled baseline for features the user intentionally uses but that
//! aren't (yet) in Harness Kit's compiled support. Schema:
//! ```json
//! {
//!   "settingsKeys": { "myKey": true },
//!   "cliFlags": ["--my-flag"],
//!   "mcpTransports": ["custom-transport"],
//!   "pluginTypes": ["my-component-type"]
//! }
//! ```
//! Users can also edit this file by hand. It is merged into the compiled baseline at the
//! start of every scan (`load_known_features`) — the user baseline only adds entries,
//! it never removes them.
//!
//! # Drift types
//! - `"missing_file"` — a config file in the compiled baseline was not found on disk
//! - `"new_feature"` — a feature was detected (settings key, CLI flag, etc.) that is not
//!   in either baseline

use crate::db::Db;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use tauri::{AppHandle, State};
use tauri_plugin_shell::ShellExt;
use tokio::time::{timeout, Duration};

// ── Baseline manifest ────────────────────────────────────────

const KNOWN_FEATURES_JSON: &str = include_str!("../parity/known_features.json");

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct KnownFeatures {
    config_files: HashMap<String, Value>,
    settings_keys: HashMap<String, bool>,
    mcp_transports: Vec<String>,
    cli_flags: Vec<String>,
    plugin_types: Vec<String>,
}

fn load_known_features() -> KnownFeatures {
    let mut known: KnownFeatures =
        serde_json::from_str(KNOWN_FEATURES_JSON).expect("Invalid known_features.json");

    // Merge user-level baseline additions from ~/.harness-kit/parity-baseline.json
    if let Some(home) = dirs::home_dir() {
        let user_path = home.join(".harness-kit").join("parity-baseline.json");
        if user_path.exists() {
            if let Ok(content) = std::fs::read_to_string(&user_path) {
                if let Ok(value) = serde_json::from_str::<Value>(&content) {
                    if let Some(keys) = value.get("settingsKeys").and_then(|v| v.as_object()) {
                        for (k, _) in keys {
                            known.settings_keys.insert(k.clone(), true);
                        }
                    }
                    if let Some(flags) = value.get("cliFlags").and_then(|v| v.as_array()) {
                        for f in flags.iter().filter_map(|v| v.as_str()) {
                            let s = f.to_string();
                            if !known.cli_flags.contains(&s) {
                                known.cli_flags.push(s);
                            }
                        }
                    }
                    if let Some(transports) =
                        value.get("mcpTransports").and_then(|v| v.as_array())
                    {
                        for t in transports.iter().filter_map(|v| v.as_str()) {
                            let s = t.to_string();
                            if !known.mcp_transports.contains(&s) {
                                known.mcp_transports.push(s);
                            }
                        }
                    }
                    if let Some(types) = value.get("pluginTypes").and_then(|v| v.as_array()) {
                        for t in types.iter().filter_map(|v| v.as_str()) {
                            let s = t.to_string();
                            if !known.plugin_types.contains(&s) {
                                known.plugin_types.push(s);
                            }
                        }
                    }
                }
            }
        }
    }

    known
}

// ── Types ─────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ParityScanResult {
    pub snapshot_id: String,
    pub cc_version: Option<String>,
    pub cc_installed: bool,
    pub features_detected: usize,
    pub drift_count: usize,
    pub drift_items: Vec<ParityDriftItem>,
    pub scanned_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ParitySnapshot {
    pub id: String,
    pub timestamp: String,
    pub cc_version: Option<String>,
    pub cc_installed: bool,
    pub categories: HashMap<String, Vec<ParityFeature>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ParityFeature {
    pub name: String,
    pub category: String,
    pub value: Option<String>,
    pub known_to_harness: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ParityDriftItem {
    pub id: i64,
    pub category: String,
    pub feature_name: String,
    pub drift_type: String,
    pub details: Option<String>,
    pub detected_at: String,
    pub acknowledged: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ParitySnapshotSummary {
    pub id: String,
    pub timestamp: String,
    pub cc_version: Option<String>,
    pub features_detected: usize,
    pub drift_count: usize,
}

// ── Helpers ───────────────────────────────────────────────────

fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339()
}

// ── Probes ────────────────────────────────────────────────────

/// Probe 1: run `claude --version` (5s timeout)
async fn probe_cli_version(app: &AppHandle) -> (bool, Option<String>) {
    let shell = app.shell();
    let result = timeout(
        Duration::from_secs(5),
        shell.command("claude").args(["--version"]).output(),
    )
    .await;
    match result {
        Ok(Ok(out)) if out.status.success() => {
            let version = String::from_utf8_lossy(&out.stdout).trim().to_string();
            (true, if version.is_empty() { None } else { Some(version) })
        }
        _ => (false, None),
    }
}

/// Probe 2: parse `claude --help` for flags and subcommands (8s timeout)
async fn probe_cli_help(app: &AppHandle) -> (Vec<String>, Vec<String>) {
    let shell = app.shell();
    let result = timeout(
        Duration::from_secs(8),
        shell.command("claude").args(["--help"]).output(),
    )
    .await;
    let output = match result {
        Ok(Ok(out)) => out,
        _ => return (vec![], vec![]),
    };

    // Some CLIs write help to stderr
    let text = if !output.stdout.is_empty() {
        String::from_utf8_lossy(&output.stdout).to_string()
    } else {
        String::from_utf8_lossy(&output.stderr).to_string()
    };

    let mut flags: Vec<String> = Vec::new();
    let mut subcommands: Vec<String> = Vec::new();
    let mut in_commands_section = false;

    for line in text.lines() {
        let trimmed = line.trim();

        // Track Commands: section
        let lower = trimmed.to_lowercase();
        if lower == "commands:" || lower == "subcommands:" || lower == "available commands:" {
            in_commands_section = true;
            continue;
        }
        // A new section header resets subcommand tracking
        if trimmed.ends_with(':') && !trimmed.starts_with('-') && !trimmed.is_empty() {
            in_commands_section = false;
        }

        // Extract --flag patterns from any line
        if let Some(flag) = extract_first_flag(trimmed) {
            if !flags.contains(&flag) {
                flags.push(flag);
            }
        }

        // Extract subcommands from Commands section
        if in_commands_section {
            if let Some(sub) = extract_subcommand(trimmed) {
                if !subcommands.contains(&sub) {
                    subcommands.push(sub);
                }
            }
        }
    }

    (flags, subcommands)
}

fn extract_first_flag(line: &str) -> Option<String> {
    let mut i = 0;
    let chars: Vec<char> = line.chars().collect();
    while i + 2 < chars.len() {
        if chars[i] == '-' && chars[i + 1] == '-' {
            let start = i;
            let rest: String = chars[start..].iter().collect();
            let end = rest
                .find(|c: char| !c.is_alphanumeric() && c != '-')
                .unwrap_or(rest.len());
            let flag = &rest[..end];
            if flag.len() > 2 {
                return Some(flag.to_string());
            }
        }
        i += 1;
    }
    None
}

fn extract_subcommand(line: &str) -> Option<String> {
    if line.starts_with('-') || line.is_empty() {
        return None;
    }
    let word: String = line.chars().take_while(|c| c.is_ascii_lowercase()).collect();
    if word.len() >= 3 && word.len() <= 20 {
        let rest = &line[word.len()..];
        if rest.starts_with(|c: char| c.is_whitespace()) || rest.is_empty() {
            return Some(word);
        }
    }
    None
}

/// Probe 3: enumerate all dotted-path keys from settings JSON files
fn probe_settings_keys() -> Vec<String> {
    let mut keys = Vec::new();
    let home = match dirs::home_dir() {
        Some(h) => h,
        None => return keys,
    };
    let claude = home.join(".claude");
    for filename in &["settings.json", "settings.local.json"] {
        let path = claude.join(filename);
        if !path.exists() {
            continue;
        }
        if let Ok(content) = std::fs::read_to_string(&path) {
            if let Ok(value) = serde_json::from_str::<Value>(&content) {
                collect_keys(&value, "", &mut keys);
            }
        }
    }
    keys.sort();
    keys.dedup();
    keys
}

fn collect_keys(value: &Value, prefix: &str, out: &mut Vec<String>) {
    if let Some(obj) = value.as_object() {
        for (key, val) in obj {
            let full_key = if prefix.is_empty() {
                key.clone()
            } else {
                format!("{}.{}", prefix, key)
            };
            out.push(full_key.clone());
            if val.is_object() {
                collect_keys(val, &full_key, out);
            }
        }
    }
}

/// Probe 4: read MCP config files and extract server names + transport types
fn probe_mcp_config() -> (Vec<String>, Vec<String>) {
    let mut servers = Vec::new();
    let mut transports = Vec::new();
    let home = match dirs::home_dir() {
        Some(h) => h,
        None => return (servers, transports),
    };
    let claude = home.join(".claude");

    let candidates = vec![
        claude.join("mcp.json"),
        claude.join(".mcp.json"),
        home.join(".mcp.json"),
    ];

    for path in candidates {
        if !path.exists() {
            continue;
        }
        if let Ok(content) = std::fs::read_to_string(&path) {
            if let Ok(value) = serde_json::from_str::<Value>(&content) {
                if let Some(mcp_servers) = value.get("mcpServers").and_then(|v| v.as_object()) {
                    for (name, config) in mcp_servers {
                        if !servers.contains(name) {
                            servers.push(name.clone());
                        }
                        // Transport type may be in "type" or "transport" field
                        for field in &["type", "transport"] {
                            if let Some(t) = config.get(field).and_then(|v| v.as_str()) {
                                let transport = t.to_string();
                                if !transports.contains(&transport) {
                                    transports.push(transport);
                                }
                            }
                        }
                        // Default transport for stdio-style configs (no type field)
                        if config.get("command").is_some() && !transports.contains(&"stdio".to_string()) {
                            transports.push("stdio".to_string());
                        }
                        if config.get("url").is_some() {
                            let t = "http".to_string();
                            if !transports.contains(&t) {
                                transports.push(t);
                            }
                        }
                    }
                }
            }
        }
    }

    (servers, transports)
}

/// Probe 5: enumerate installed plugins and their component types
fn probe_plugins() -> Vec<(String, Vec<String>)> {
    let mut plugins = Vec::new();
    let home = match dirs::home_dir() {
        Some(h) => h,
        None => return plugins,
    };
    let plugins_dir = home.join(".claude").join("plugins");
    if !plugins_dir.exists() {
        return plugins;
    }

    let entries = match std::fs::read_dir(&plugins_dir) {
        Ok(e) => e,
        Err(_) => return plugins,
    };

    for entry in entries.flatten() {
        let manifest_path = entry.path().join(".claude-plugin").join("plugin.json");
        if !manifest_path.exists() {
            continue;
        }
        let content = match std::fs::read_to_string(&manifest_path) {
            Ok(c) => c,
            Err(_) => continue,
        };
        let manifest: Value = match serde_json::from_str(&content) {
            Ok(v) => v,
            Err(_) => continue,
        };

        let plugin_name = manifest
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown")
            .to_string();

        let mut types = Vec::new();
        let plugin_dir = entry.path();
        for component_type in &["skills", "agents", "hooks", "commands", "scripts"] {
            if plugin_dir.join(component_type).exists() {
                types.push(component_type.to_string());
            }
        }

        plugins.push((plugin_name, types));
    }

    plugins
}

/// Probe 6: check existence of standard config files
fn probe_config_files() -> HashMap<String, bool> {
    let mut found = HashMap::new();
    let home = match dirs::home_dir() {
        Some(h) => h,
        None => return found,
    };

    let checks: &[(&str, std::path::PathBuf)] = &[
        ("CLAUDE.md", home.join("CLAUDE.md")),
        ("AGENT.md", home.join("AGENT.md")),
        ("SOUL.md", home.join("SOUL.md")),
        (".mcp.json", home.join(".mcp.json")),
        (".claude/settings.json", home.join(".claude").join("settings.json")),
        (".claude/settings.local.json", home.join(".claude").join("settings.local.json")),
        (".claude/hooks/", home.join(".claude").join("hooks")),
    ];

    for (name, path) in checks {
        found.insert(name.to_string(), path.exists());
    }

    found
}

// ── Drift detection ───────────────────────────────────────────

type DriftTuple = (String, String, String, Option<String>);

fn detect_drift(categories: &HashMap<String, Vec<ParityFeature>>) -> Vec<DriftTuple> {
    let mut drift: Vec<DriftTuple> = Vec::new();

    // Settings keys: new keys not in baseline
    if let Some(features) = categories.get("settings_key") {
        for f in features {
            if !f.known_to_harness {
                drift.push((
                    "settings_key".to_string(),
                    f.name.clone(),
                    "new_feature".to_string(),
                    Some(format!(
                        "Key '{}' found in settings.json but not tracked in Harness baseline",
                        f.name
                    )),
                ));
            }
        }
    }

    // CLI flags: new flags not in baseline
    if let Some(features) = categories.get("cli_flag") {
        for f in features {
            if !f.known_to_harness {
                drift.push((
                    "cli_flag".to_string(),
                    f.name.clone(),
                    "new_feature".to_string(),
                    Some(format!(
                        "CLI flag '{}' found in --help output but not tracked in Harness baseline",
                        f.name
                    )),
                ));
            }
        }
    }

    // MCP transports: new transport types not in baseline
    if let Some(features) = categories.get("mcp_transport") {
        for f in features {
            if !f.known_to_harness {
                drift.push((
                    "mcp_transport".to_string(),
                    f.name.clone(),
                    "new_feature".to_string(),
                    Some(format!(
                        "MCP transport type '{}' detected but not tracked in Harness baseline",
                        f.name
                    )),
                ));
            }
        }
    }

    // Plugin types: new component types not in baseline
    if let Some(features) = categories.get("plugin_type") {
        for f in features {
            if !f.known_to_harness {
                drift.push((
                    "plugin_type".to_string(),
                    f.name.clone(),
                    "new_feature".to_string(),
                    Some(format!(
                        "Plugin component type '{}' found but not tracked in Harness baseline",
                        f.name
                    )),
                ));
            }
        }
    }

    // Config files: surface missing files that Harness knows about
    if let Some(features) = categories.get("config_file") {
        for f in features {
            if f.known_to_harness && f.value.as_deref() == Some("not_found") {
                drift.push((
                    "config_file".to_string(),
                    f.name.clone(),
                    "missing_file".to_string(),
                    Some(format!(
                        "{} is expected but not found at its default location",
                        f.name
                    )),
                ));
            }
        }
    }

    drift
}

// ── Commands ──────────────────────────────────────────────────

/// Run all parity probes, persist a new snapshot + drift items to SQLite, and return a summary.
///
/// Probes run: CLI version, CLI help flags, settings keys, MCP config, plugins, config files.
/// Previously acknowledged drift items carry forward automatically — they are not re-flagged.
/// Mutates the DB: inserts one row into `parity_snapshots` and N rows into `parity_drift`.
#[tauri::command]
pub async fn run_parity_scan(
    app: AppHandle,
    db: State<'_, Db>,
) -> Result<ParityScanResult, String> {
    let known = load_known_features();
    let snapshot_id = uuid::Uuid::new_v4().to_string();
    let scanned_at = now_iso();

    // Run async probes concurrently; sync probes run after
    let ((cc_installed, cc_version), (cli_flags, cli_subcommands)) =
        tokio::join!(probe_cli_version(&app), probe_cli_help(&app));
    let settings_keys = probe_settings_keys();
    let (mcp_servers, mcp_transports) = probe_mcp_config();
    let plugins = probe_plugins();
    let config_file_presence = probe_config_files();

    let mut categories: HashMap<String, Vec<ParityFeature>> = HashMap::new();

    // Config files — merge detected + baseline entries
    let mut cf_features: Vec<ParityFeature> = Vec::new();
    for (name, exists) in &config_file_presence {
        let known_supported = known.config_files.contains_key(name.as_str());
        cf_features.push(ParityFeature {
            name: name.clone(),
            category: "config_file".to_string(),
            value: Some(if *exists { "detected" } else { "not_found" }.to_string()),
            known_to_harness: known_supported,
        });
    }
    // Add baseline entries not checked on-disk
    for name in known.config_files.keys() {
        if !cf_features.iter().any(|f| &f.name == name) {
            cf_features.push(ParityFeature {
                name: name.clone(),
                category: "config_file".to_string(),
                value: Some("not_found".to_string()),
                known_to_harness: true,
            });
        }
    }
    cf_features.sort_by(|a, b| a.name.cmp(&b.name));
    categories.insert("config_file".to_string(), cf_features);

    // Settings keys
    let sk_features: Vec<ParityFeature> = settings_keys
        .iter()
        .map(|key| ParityFeature {
            name: key.clone(),
            category: "settings_key".to_string(),
            value: None,
            known_to_harness: known.settings_keys.contains_key(key.as_str()),
        })
        .collect();
    categories.insert("settings_key".to_string(), sk_features);

    // CLI flags
    let flag_features: Vec<ParityFeature> = cli_flags
        .iter()
        .map(|flag| ParityFeature {
            name: flag.clone(),
            category: "cli_flag".to_string(),
            value: None,
            known_to_harness: known.cli_flags.contains(flag),
        })
        .collect();
    categories.insert("cli_flag".to_string(), flag_features);

    // CLI subcommands (informational)
    let sub_features: Vec<ParityFeature> = cli_subcommands
        .iter()
        .map(|sub| ParityFeature {
            name: sub.clone(),
            category: "cli_subcommand".to_string(),
            value: None,
            known_to_harness: false,
        })
        .collect();
    categories.insert("cli_subcommand".to_string(), sub_features);

    // MCP transports
    let transport_features: Vec<ParityFeature> = mcp_transports
        .iter()
        .map(|t| ParityFeature {
            name: t.clone(),
            category: "mcp_transport".to_string(),
            value: None,
            known_to_harness: known.mcp_transports.contains(t),
        })
        .collect();
    categories.insert("mcp_transport".to_string(), transport_features);

    // MCP servers (informational)
    let server_features: Vec<ParityFeature> = mcp_servers
        .iter()
        .map(|s| ParityFeature {
            name: s.clone(),
            category: "mcp_server".to_string(),
            value: None,
            known_to_harness: false,
        })
        .collect();
    categories.insert("mcp_server".to_string(), server_features);

    // Plugin component types (deduplicated across plugins)
    let mut seen_types: HashSet<String> = HashSet::new();
    let mut plugin_type_features: Vec<ParityFeature> = Vec::new();
    for (_name, types) in &plugins {
        for t in types {
            if seen_types.insert(t.clone()) {
                plugin_type_features.push(ParityFeature {
                    name: t.clone(),
                    category: "plugin_type".to_string(),
                    value: None,
                    known_to_harness: known.plugin_types.contains(t),
                });
            }
        }
    }
    categories.insert("plugin_type".to_string(), plugin_type_features);

    let features_detected: usize = categories.values().map(|v| v.len()).sum();

    // Detect drift
    let drift_tuples = detect_drift(&categories);

    // Persist snapshot and drift
    let raw_data = serde_json::to_string(&categories)
        .map_err(|e| format!("Failed to serialize categories: {}", e))?;

    // Carry forward acknowledged state from all previous scans so re-scanning
    // doesn't resurface items the user already acknowledged.
    let prev_acked = load_prev_acknowledged(&db)?;

    {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;

        let active_drift_count = drift_tuples
            .iter()
            .filter(|(cat, name, dtype, _)| {
                !prev_acked.contains(&(cat.clone(), name.clone(), dtype.clone()))
            })
            .count();

        conn.execute(
            "INSERT INTO parity_snapshots (id, timestamp, cc_version, cc_installed, raw_data, features_count, drift_count) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            rusqlite::params![
                snapshot_id,
                scanned_at,
                cc_version,
                cc_installed,
                raw_data,
                features_detected as i64,
                active_drift_count as i64,
            ],
        )
        .map_err(|e| format!("Failed to insert snapshot: {}", e))?;

        for (category, feature_name, drift_type, details) in &drift_tuples {
            let pre_ack = prev_acked.contains(&(
                category.clone(),
                feature_name.clone(),
                drift_type.clone(),
            ));
            let ack_at = pre_ack.then_some(scanned_at.as_str());
            conn.execute(
                "INSERT INTO parity_drift \
                 (snapshot_id, category, feature_name, drift_type, details, detected_at, acknowledged, acknowledged_at) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                rusqlite::params![
                    snapshot_id,
                    category,
                    feature_name,
                    drift_type,
                    details,
                    scanned_at,
                    pre_ack as i64,
                    ack_at,
                ],
            )
            .map_err(|e| format!("Failed to insert drift item: {}", e))?;
        }
    }

    let all_drift = load_drift_by_snapshot(&db, &snapshot_id)?;
    let active_drift: Vec<ParityDriftItem> = all_drift.into_iter().filter(|d| !d.acknowledged).collect();

    Ok(ParityScanResult {
        snapshot_id,
        cc_version,
        cc_installed,
        features_detected,
        drift_count: active_drift.len(),
        drift_items: active_drift,
        scanned_at,
    })
}

fn load_prev_acknowledged(db: &Db) -> Result<HashSet<(String, String, String)>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT DISTINCT category, feature_name, drift_type \
             FROM parity_drift WHERE acknowledged = 1",
        )
        .map_err(|e| e.to_string())?;
    let items = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(items)
}

fn load_drift_by_snapshot(db: &Db, snapshot_id: &str) -> Result<Vec<ParityDriftItem>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, category, feature_name, drift_type, details, detected_at, acknowledged \
             FROM parity_drift WHERE snapshot_id = ?1",
        )
        .map_err(|e| e.to_string())?;

    let items = stmt
        .query_map(rusqlite::params![snapshot_id], |row| {
            Ok(ParityDriftItem {
                id: row.get(0)?,
                category: row.get(1)?,
                feature_name: row.get(2)?,
                drift_type: row.get(3)?,
                details: row.get(4)?,
                detected_at: row.get(5)?,
                acknowledged: row.get::<_, bool>(6)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(items)
}

/// Return the most recent parity snapshot, or `null` if no scan has run yet.
/// The snapshot includes the full feature matrix (all detected features by category).
#[tauri::command]
pub fn get_parity_snapshot(db: State<'_, Db>) -> Result<Option<ParitySnapshot>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let result = conn.query_row(
        "SELECT id, timestamp, cc_version, cc_installed, raw_data \
         FROM parity_snapshots ORDER BY timestamp DESC LIMIT 1",
        [],
        |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, bool>(3)?,
                row.get::<_, String>(4)?,
            ))
        },
    );

    match result {
        Ok((id, timestamp, cc_version, cc_installed, raw_data)) => {
            let categories: HashMap<String, Vec<ParityFeature>> =
                serde_json::from_str(&raw_data).unwrap_or_default();
            Ok(Some(ParitySnapshot {
                id,
                timestamp,
                cc_version,
                cc_installed,
                categories,
            }))
        }
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Return drift items from the most recent snapshot.
/// Pass `include_acknowledged: true` to include items the user has already reviewed.
/// Scoped to the latest snapshot only — older drift does not reappear after a rescan.
#[tauri::command]
pub fn get_parity_drift(
    db: State<'_, Db>,
    include_acknowledged: bool,
) -> Result<Vec<ParityDriftItem>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    // Scope to the latest snapshot only — prevents items from accumulating across scans.
    let latest_id: Option<String> = match conn.query_row(
        "SELECT id FROM parity_snapshots ORDER BY timestamp DESC LIMIT 1",
        [],
        |row| row.get(0),
    ) {
        Ok(id) => Some(id),
        Err(rusqlite::Error::QueryReturnedNoRows) => None,
        Err(e) => return Err(e.to_string()),
    };

    let snapshot_id = match latest_id {
        Some(id) => id,
        None => return Ok(vec![]),
    };

    let sql = if include_acknowledged {
        "SELECT id, category, feature_name, drift_type, details, detected_at, acknowledged \
         FROM parity_drift WHERE snapshot_id = ?1 ORDER BY detected_at DESC"
    } else {
        "SELECT id, category, feature_name, drift_type, details, detected_at, acknowledged \
         FROM parity_drift WHERE snapshot_id = ?1 AND acknowledged = 0 ORDER BY detected_at DESC"
    };

    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let items = stmt
        .query_map(rusqlite::params![snapshot_id], |row| {
            Ok(ParityDriftItem {
                id: row.get(0)?,
                category: row.get(1)?,
                feature_name: row.get(2)?,
                drift_type: row.get(3)?,
                details: row.get(4)?,
                detected_at: row.get(5)?,
                acknowledged: row.get::<_, bool>(6)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(items)
}

/// Mark a drift item as acknowledged (reviewed but not acted on).
/// Acknowledged items are hidden from the default drift list; pass `include_acknowledged: true`
/// to `get_parity_drift` to see them.
#[tauri::command]
pub fn acknowledge_drift(db: State<'_, Db>, drift_id: i64) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let acknowledged_at = now_iso();
    // Scope to the latest snapshot to prevent silently suppressing drift from older scans.
    conn.execute(
        "UPDATE parity_drift SET acknowledged = 1, acknowledged_at = ?1 \
         WHERE id = ?2 \
         AND snapshot_id = (SELECT id FROM parity_snapshots ORDER BY timestamp DESC LIMIT 1)",
        rusqlite::params![acknowledged_at, drift_id],
    )
    .map_err(|e| format!("Failed to acknowledge drift item: {}", e))?;
    Ok(())
}

/// Return a reverse-chronological list of snapshot summaries (no feature detail).
/// Defaults to the 20 most recent scans; pass `limit` to override.
/// Used to build a scan history timeline.
#[tauri::command]
pub fn get_parity_history(
    db: State<'_, Db>,
    limit: Option<i64>,
) -> Result<Vec<ParitySnapshotSummary>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let limit = limit.unwrap_or(20).clamp(1, 100);
    let mut stmt = conn
        .prepare(
            "SELECT id, timestamp, cc_version, features_count, drift_count \
             FROM parity_snapshots ORDER BY timestamp DESC LIMIT ?1",
        )
        .map_err(|e| e.to_string())?;

    let items = stmt
        .query_map(rusqlite::params![limit], |row| {
            Ok(ParitySnapshotSummary {
                id: row.get(0)?,
                timestamp: row.get(1)?,
                cc_version: row.get(2)?,
                features_detected: row.get::<_, i64>(3)? as usize,
                drift_count: row.get::<_, i64>(4)? as usize,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(items)
}

// ── Action commands ────────────────────────────────────────────

/// Create a config file at its canonical location with a sensible default template.
/// Returns the absolute path of the created file.
#[tauri::command]
pub fn create_config_file(name: String) -> Result<String, String> {
    let home = dirs::home_dir().ok_or("Cannot determine home directory")?;

    let (path, content) = match name.as_str() {
        "CLAUDE.md" => (
            home.join("CLAUDE.md"),
            "# Global Instructions\n\n## Commands\n\n<!-- build, test, dev commands -->\n\n## Architecture\n\n<!-- entry points, package layout, key files -->\n\n## Gotchas\n\n<!-- non-obvious patterns and common mistakes -->\n".to_string(),
        ),
        "AGENT.md" => (
            home.join("AGENT.md"),
            "# Behavioral Configuration\n\n## Tone\n\nDirect and concise. No filler words.\n\n## Autonomy\n\nAsk before destructive or hard-to-reverse operations.\n\n## Workflow\n\nWork in focused sessions. Commit changes incrementally.\n".to_string(),
        ),
        "SOUL.md" => (
            home.join("SOUL.md"),
            "# Identity\n\n## Values\n\n<!-- Your collaboration values and preferences -->\n\n## Relationship Context\n\n<!-- How you prefer to work with Claude across sessions -->\n".to_string(),
        ),
        ".mcp.json" => (
            home.join(".mcp.json"),
            "{\n  \"mcpServers\": {}\n}\n".to_string(),
        ),
        ".claude/settings.json" => (
            home.join(".claude").join("settings.json"),
            "{\n  \"permissions\": {\n    \"allow\": [],\n    \"deny\": []\n  }\n}\n".to_string(),
        ),
        _ => return Err(format!("Unknown config file: {}", name)),
    };

    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    if path.exists() {
        return Err(format!("{} already exists at {}", name, path.display()));
    }

    std::fs::write(&path, &content)
        .map_err(|e| format!("Failed to create {}: {}", name, e))?;

    Ok(path.display().to_string())
}

/// Add a feature to the user-level parity baseline so it is no longer flagged as drift.
/// Stored at ~/.harness-kit/parity-baseline.json and merged on each scan.
#[tauri::command]
pub fn add_to_parity_baseline(category: String, feature_name: String) -> Result<(), String> {
    if feature_name.len() > 256 || feature_name.contains('\0') {
        return Err("Invalid feature_name".to_string());
    }
    let home = dirs::home_dir().ok_or("Cannot determine home directory")?;
    let path = home.join(".harness-kit").join("parity-baseline.json");

    let mut baseline: Value = if path.exists() {
        let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).unwrap_or(serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    match category.as_str() {
        "settings_key" => {
            if baseline.get("settingsKeys").is_none() {
                baseline["settingsKeys"] = serde_json::json!({});
            }
            if let Some(obj) = baseline["settingsKeys"].as_object_mut() {
                obj.insert(feature_name, Value::Bool(true));
            }
        }
        "cli_flag" => {
            if baseline.get("cliFlags").is_none() {
                baseline["cliFlags"] = serde_json::json!([]);
            }
            if let Some(arr) = baseline["cliFlags"].as_array_mut() {
                let val = Value::String(feature_name);
                if !arr.contains(&val) { arr.push(val); }
            }
        }
        "mcp_transport" => {
            if baseline.get("mcpTransports").is_none() {
                baseline["mcpTransports"] = serde_json::json!([]);
            }
            if let Some(arr) = baseline["mcpTransports"].as_array_mut() {
                let val = Value::String(feature_name);
                if !arr.contains(&val) { arr.push(val); }
            }
        }
        "plugin_type" => {
            if baseline.get("pluginTypes").is_none() {
                baseline["pluginTypes"] = serde_json::json!([]);
            }
            if let Some(arr) = baseline["pluginTypes"].as_array_mut() {
                let val = Value::String(feature_name);
                if !arr.contains(&val) { arr.push(val); }
            }
        }
        _ => return Err(format!("Unknown category: {}", category)),
    }

    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let json = serde_json::to_string_pretty(&baseline).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())?;

    Ok(())
}

// ── Tests ─────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn make_feature(name: &str, category: &str, known: bool, value: Option<&str>) -> ParityFeature {
        ParityFeature {
            name: name.to_string(),
            category: category.to_string(),
            value: value.map(|v| v.to_string()),
            known_to_harness: known,
        }
    }

    fn empty_known() -> KnownFeatures {
        KnownFeatures {
            config_files: HashMap::new(),
            settings_keys: HashMap::new(),
            mcp_transports: vec![],
            cli_flags: vec![],
            plugin_types: vec![],
        }
    }

    // ── detect_drift ──────────────────────────────────────────

    #[test]
    fn detect_drift_flags_unknown_settings_key() {
        let mut categories = HashMap::new();
        categories.insert(
            "settings_key".to_string(),
            vec![
                make_feature("permissions.allow", "settings_key", true, None),
                make_feature("someNewKey", "settings_key", false, None),
            ],
        );
        let drift = detect_drift(&categories);
        assert_eq!(drift.len(), 1);
        assert_eq!(drift[0].0, "settings_key");
        assert_eq!(drift[0].1, "someNewKey");
        assert_eq!(drift[0].2, "new_feature");
    }

    #[test]
    fn detect_drift_no_drift_for_all_known_features() {
        let mut categories = HashMap::new();
        categories.insert(
            "settings_key".to_string(),
            vec![make_feature("permissions.allow", "settings_key", true, None)],
        );
        categories.insert(
            "cli_flag".to_string(),
            vec![make_feature("--version", "cli_flag", true, None)],
        );
        let drift = detect_drift(&categories);
        assert!(drift.is_empty());
    }

    #[test]
    fn detect_drift_flags_unknown_cli_flag() {
        let mut categories = HashMap::new();
        categories.insert(
            "cli_flag".to_string(),
            vec![
                make_feature("--version", "cli_flag", true, None),
                make_feature("--new-flag", "cli_flag", false, None),
            ],
        );
        let drift = detect_drift(&categories);
        assert_eq!(drift.len(), 1);
        assert_eq!(drift[0].0, "cli_flag");
        assert_eq!(drift[0].1, "--new-flag");
        assert_eq!(drift[0].2, "new_feature");
    }

    #[test]
    fn detect_drift_flags_missing_known_config_file() {
        let mut categories = HashMap::new();
        categories.insert(
            "config_file".to_string(),
            vec![
                make_feature("CLAUDE.md", "config_file", true, Some("not_found")),
                make_feature("AGENT.md", "config_file", true, Some("detected")),
            ],
        );
        let drift = detect_drift(&categories);
        assert_eq!(drift.len(), 1);
        assert_eq!(drift[0].0, "config_file");
        assert_eq!(drift[0].1, "CLAUDE.md");
        assert_eq!(drift[0].2, "missing_file");
    }

    #[test]
    fn detect_drift_does_not_flag_detected_config_file() {
        let mut categories = HashMap::new();
        categories.insert(
            "config_file".to_string(),
            vec![make_feature("CLAUDE.md", "config_file", true, Some("detected"))],
        );
        let drift = detect_drift(&categories);
        assert!(drift.is_empty());
    }

    #[test]
    fn detect_drift_multiple_categories_aggregated() {
        let mut categories = HashMap::new();
        categories.insert(
            "settings_key".to_string(),
            vec![make_feature("unknownKey", "settings_key", false, None)],
        );
        categories.insert(
            "cli_flag".to_string(),
            vec![make_feature("--unknown-flag", "cli_flag", false, None)],
        );
        categories.insert(
            "config_file".to_string(),
            vec![make_feature("SOUL.md", "config_file", true, Some("not_found"))],
        );
        let drift = detect_drift(&categories);
        assert_eq!(drift.len(), 3);
    }

    // ── create_config_file ────────────────────────────────────

    #[test]
    fn create_config_file_rejects_unknown_name() {
        let result = create_config_file("UNKNOWN.md".to_string());
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Unknown config file"));
    }

    // ── add_to_parity_baseline ────────────────────────────────

    #[test]
    fn add_to_parity_baseline_rejects_long_feature_name() {
        let long_name = "a".repeat(257);
        let result = add_to_parity_baseline("settings_key".to_string(), long_name);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Invalid feature_name"));
    }

    #[test]
    fn add_to_parity_baseline_rejects_null_byte_in_name() {
        let result = add_to_parity_baseline("settings_key".to_string(), "bad\0name".to_string());
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Invalid feature_name"));
    }

    #[test]
    fn add_to_parity_baseline_rejects_unknown_category() {
        // Use a short valid name to get past the length check
        let result = add_to_parity_baseline("invalid_category".to_string(), "someKey".to_string());
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Unknown category"));
    }

    // ── load_known_features ───────────────────────────────────

    #[test]
    fn load_known_features_parses_embedded_json() {
        let known = load_known_features();
        // Verify the baseline has at minimum the core config files and settings keys
        assert!(known.config_files.contains_key("CLAUDE.md"));
        assert!(known.config_files.contains_key("AGENT.md"));
        assert!(known.settings_keys.contains_key("permissions.allow"));
        assert!(!known.cli_flags.is_empty());
        assert!(!known.mcp_transports.is_empty());
    }
}
