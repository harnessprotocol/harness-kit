use crate::db::Db;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};
use tauri_plugin_shell::ShellExt;

// ── Types ───────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PermissionsState {
    pub tools: ToolPermissions,
    pub paths: PathPermissions,
    pub network: NetworkPermissions,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ToolPermissions {
    pub allow: Vec<String>,
    pub deny: Vec<String>,
    pub ask: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PathPermissions {
    pub writable: Vec<String>,
    pub readonly: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NetworkPermissions {
    pub allowed_hosts: Vec<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SecurityPreset {
    pub id: String,
    pub name: String,
    pub description: String,
    pub permissions: PermissionsState,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct KeychainSecretInfo {
    pub name: String,
    pub description: String,
    pub required: bool,
    pub is_set: bool,
    pub plugin_name: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EnvConfigEntry {
    pub name: String,
    pub description: String,
    pub value: String,
    pub plugin_name: Option<String>,
}

// ── Validation ──────────────────────────────────────────────

fn validate_secret_name(name: &str) -> Result<(), String> {
    if name.is_empty() || name.len() > 128 {
        return Err("Secret name must be 1-128 characters".to_string());
    }
    if !name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-' || c == '.') {
        return Err("Secret name may only contain alphanumeric characters, underscores, hyphens, and dots".to_string());
    }
    Ok(())
}

// ── Helpers ─────────────────────────────────────────────────

fn settings_path() -> Result<std::path::PathBuf, String> {
    let home = dirs::home_dir().ok_or("No home directory")?;
    Ok(home.join(".claude").join("settings.json"))
}

fn env_config_path() -> Result<std::path::PathBuf, String> {
    let home = dirs::home_dir().ok_or("No home directory")?;
    Ok(home.join(".harness-kit").join("env.json"))
}

fn read_settings_json() -> Result<serde_json::Value, String> {
    read_settings_at(&settings_path()?)
}

fn read_settings_at(path: &std::path::Path) -> Result<serde_json::Value, String> {
    if !path.exists() {
        return Ok(serde_json::json!({}));
    }
    let content = std::fs::read_to_string(path)
        .map_err(|e| format!("Failed to read settings.json: {}", e))?;
    serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse settings.json: {}", e))
}

fn write_settings_json(value: &serde_json::Value) -> Result<(), String> {
    write_settings_at(&settings_path()?, value)
}

/// Serialize `value` and replace `path` atomically (temp file in the same
/// directory, 0600 from the first byte, fsync, rename). The previous file is
/// copied to a timestamped `.bak-<time>` sibling first. A trailing newline in
/// the previous file is kept so untouched content stays byte-identical.
fn write_settings_at(path: &std::path::Path, value: &serde_json::Value) -> Result<(), String> {
    use std::io::Write;

    let parent = path.parent().ok_or("settings path has no parent directory")?;
    std::fs::create_dir_all(parent)
        .map_err(|e| format!("Failed to create directory: {}", e))?;

    let mut content = serde_json::to_string_pretty(value)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;
    if let Ok(previous) = std::fs::read_to_string(path) {
        if previous.ends_with('\n') {
            content.push('\n');
        }
        let stamp = chrono::Utc::now().format("%Y%m%dT%H%M%S%3f");
        let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        let backup = parent.join(format!("{}.bak-{}", name, stamp));
        write_private_file(&backup, previous.as_bytes())
            .map_err(|e| format!("Failed to create backup: {}", e))?;
    }

    let temp = parent.join(format!(".hk-tmp-{}", uuid::Uuid::new_v4().simple()));
    let staged = (|| -> std::io::Result<()> {
        let mut file = open_private_new(&temp)?;
        file.write_all(content.as_bytes())?;
        file.sync_all()?;
        drop(file);
        std::fs::rename(&temp, path)
    })();
    if let Err(e) = staged {
        let _ = std::fs::remove_file(&temp);
        return Err(format!("Failed to write settings.json: {}", e));
    }
    Ok(())
}

fn open_private_new(path: &std::path::Path) -> std::io::Result<std::fs::File> {
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    options.open(path)
}

fn write_private_file(path: &std::path::Path, bytes: &[u8]) -> std::io::Result<()> {
    use std::io::Write;
    let mut file = open_private_new(path)?;
    file.write_all(bytes)?;
    file.sync_all()
}

fn extract_permissions(settings: &serde_json::Value) -> PermissionsState {
    let tools = ToolPermissions {
        allow: extract_string_array(settings, &["permissions", "allow"]),
        deny: extract_string_array(settings, &["permissions", "deny"]),
        ask: extract_string_array(settings, &["permissions", "ask"]),
    };
    let paths = PathPermissions {
        writable: extract_string_array(settings, &["paths", "writable"]),
        readonly: extract_string_array(settings, &["paths", "readonly"]),
    };
    let network = NetworkPermissions {
        allowed_hosts: extract_string_array(settings, &["network", "allowedHosts"]),
    };
    PermissionsState { tools, paths, network }
}

fn extract_string_array(value: &serde_json::Value, keys: &[&str]) -> Vec<String> {
    let mut current = value;
    for key in keys {
        match current.get(key) {
            Some(v) => current = v,
            None => return vec![],
        }
    }
    current
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default()
}

fn apply_permissions_to_settings(
    settings: &mut serde_json::Value,
    perms: &PermissionsState,
) -> Result<(), String> {
    let obj = settings.as_object_mut()
        .ok_or("settings.json root is not a JSON object")?;

    // Tools permissions
    let permissions = obj
        .entry("permissions")
        .or_insert_with(|| serde_json::json!({}));
    if let Some(p) = permissions.as_object_mut() {
        p.insert("allow".to_string(), serde_json::json!(perms.tools.allow));
        p.insert("deny".to_string(), serde_json::json!(perms.tools.deny));
        p.insert("ask".to_string(), serde_json::json!(perms.tools.ask));
    }

    // Paths
    let paths = obj
        .entry("paths")
        .or_insert_with(|| serde_json::json!({}));
    if let Some(p) = paths.as_object_mut() {
        p.insert("writable".to_string(), serde_json::json!(perms.paths.writable));
        p.insert("readonly".to_string(), serde_json::json!(perms.paths.readonly));
    }

    // Network
    let network = obj
        .entry("network")
        .or_insert_with(|| serde_json::json!({}));
    if let Some(n) = network.as_object_mut() {
        n.insert("allowedHosts".to_string(), serde_json::json!(perms.network.allowed_hosts));
    }

    Ok(())
}

/// Append each of `items` that is not already in `parent[key]`, keeping the
/// existing order. Creates the array when absent; refuses to clobber a value
/// that is not an array.
fn union_into(
    parent: &mut serde_json::Map<String, serde_json::Value>,
    key: &str,
    items: &[String],
    remove: &[String],
) -> Result<(), String> {
    if items.is_empty() && !parent.contains_key(key) {
        return Ok(());
    }
    let entry = parent.entry(key).or_insert_with(|| serde_json::json!([]));
    let arr = entry
        .as_array_mut()
        .ok_or_else(|| format!("settings.json \"{}\" is not an array; refusing to overwrite it", key))?;
    arr.retain(|v| !v.as_str().map(|s| remove.iter().any(|r| r == s)).unwrap_or(false));
    for item in items {
        if !arr.iter().any(|v| v.as_str() == Some(item.as_str())) {
            arr.push(serde_json::Value::String(item.clone()));
        }
    }
    Ok(())
}

fn child_object<'a>(
    parent: &'a mut serde_json::Map<String, serde_json::Value>,
    key: &str,
) -> Result<&'a mut serde_json::Map<String, serde_json::Value>, String> {
    parent
        .entry(key)
        .or_insert_with(|| serde_json::json!({}))
        .as_object_mut()
        .ok_or_else(|| format!("settings.json \"{}\" is not an object; refusing to overwrite it", key))
}

/// Deny rules a preset would remove: those it explicitly allows, by identical
/// rule string or by a `*` wildcard allow.
fn dropped_deny_rules(settings: &serde_json::Value, preset: &PermissionsState) -> Vec<String> {
    let wildcard = preset.tools.allow.iter().any(|a| a == "*");
    extract_string_array(settings, &["permissions", "deny"])
        .into_iter()
        .filter(|d| wildcard || preset.tools.allow.contains(d))
        .collect()
}

/// (key, rules to add, rules to remove)
type RuleList<'a> = (&'a str, &'a [String], &'a [String]);

/// Merge a preset into existing settings: union of every list, existing order
/// kept, new rules appended, every other key untouched. `drop_deny` lists deny
/// rules to remove (already confirmed by the caller).
fn merge_preset_into_settings(
    settings: &mut serde_json::Value,
    preset: &PermissionsState,
    drop_deny: &[String],
) -> Result<(), String> {
    let obj = settings.as_object_mut().ok_or("settings.json root is not a JSON object")?;
    let groups: [(&str, Vec<RuleList>); 3] = [
        ("permissions", vec![
            ("allow", &preset.tools.allow, &[]),
            ("deny", &preset.tools.deny, drop_deny),
            ("ask", &preset.tools.ask, &[]),
        ]),
        ("paths", vec![
            ("writable", &preset.paths.writable, &[]),
            ("readonly", &preset.paths.readonly, &[]),
        ]),
        ("network", vec![("allowedHosts", &preset.network.allowed_hosts, &[])]),
    ];
    for (group, lists) in groups {
        // Leave the section absent when the preset has nothing for it.
        if !obj.contains_key(group) && lists.iter().all(|(_, items, _)| items.is_empty()) {
            continue;
        }
        let section = child_object(obj, group)?;
        for (key, items, remove) in lists {
            union_into(section, key, items, remove)?;
        }
    }
    Ok(())
}

#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PresetOutcome {
    /// False when nothing was written because deny rules need confirmation.
    pub applied: bool,
    /// Deny rules the preset removes (not yet removed when `applied` is false).
    pub dropped_deny: Vec<String>,
}

/// Apply `preset` to the settings file at `path`. Returns the outcome plus the
/// permissions before the write, for the audit log.
fn apply_preset_at(
    path: &std::path::Path,
    preset: &PermissionsState,
    confirm_drop_deny: bool,
) -> Result<(PresetOutcome, PermissionsState), String> {
    let mut settings = read_settings_at(path)?;
    let old_perms = extract_permissions(&settings);
    let dropped = dropped_deny_rules(&settings, preset);
    if !dropped.is_empty() && !confirm_drop_deny {
        return Ok((PresetOutcome { applied: false, dropped_deny: dropped }, old_perms));
    }
    merge_preset_into_settings(&mut settings, preset, &dropped)?;
    write_settings_at(path, &settings)?;
    Ok((PresetOutcome { applied: true, dropped_deny: dropped }, old_perms))
}

fn log_audit(
    db: &Db,
    event_type: &str,
    category: &str,
    summary: &str,
    details: Option<&str>,
    source: &str,
) {
    let conn = match db.conn.lock() {
        Ok(c) => c,
        Err(_) => return,
    };
    let id = uuid::Uuid::new_v4().to_string();
    let timestamp = chrono::Utc::now().to_rfc3339();
    let _ = conn.execute(
        "INSERT INTO audit_log (id, timestamp, event_type, category, summary, details, source) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![id, timestamp, event_type, category, summary, details, source],
    );
}

fn get_presets() -> Vec<SecurityPreset> {
    vec![
        SecurityPreset {
            id: "strict".to_string(),
            name: "Strict".to_string(),
            description: "Minimal access. All tools denied except Read/Glob/Grep in ask mode. No writable paths. No network.".to_string(),
            permissions: PermissionsState {
                tools: ToolPermissions {
                    allow: vec![],
                    deny: vec![],
                    ask: vec!["Read".to_string(), "Glob".to_string(), "Grep".to_string()],
                },
                paths: PathPermissions {
                    writable: vec![],
                    readonly: vec![],
                },
                network: NetworkPermissions {
                    allowed_hosts: vec![],
                },
            },
        },
        SecurityPreset {
            id: "standard".to_string(),
            name: "Standard".to_string(),
            description: "Common tools allowed. Project directory writable. GitHub hosts allowed.".to_string(),
            permissions: PermissionsState {
                tools: ToolPermissions {
                    allow: vec![
                        "Read".to_string(), "Glob".to_string(), "Grep".to_string(),
                        "Edit".to_string(), "Write".to_string(), "Bash".to_string(),
                    ],
                    deny: vec![],
                    ask: vec![],
                },
                paths: PathPermissions {
                    writable: vec![".".to_string()],
                    readonly: vec![],
                },
                network: NetworkPermissions {
                    allowed_hosts: vec![
                        "github.com".to_string(),
                        "api.github.com".to_string(),
                    ],
                },
            },
        },
        SecurityPreset {
            id: "permissive".to_string(),
            name: "Permissive".to_string(),
            description: "All tools allowed. Full filesystem access. Unrestricted network.".to_string(),
            permissions: PermissionsState {
                tools: ToolPermissions {
                    allow: vec!["*".to_string()],
                    deny: vec![],
                    ask: vec![],
                },
                paths: PathPermissions {
                    writable: vec!["*".to_string()],
                    readonly: vec![],
                },
                network: NetworkPermissions {
                    allowed_hosts: vec!["*".to_string()],
                },
            },
        },
    ]
}

// ── Commands ────────────────────────────────────────────────

#[tauri::command]
pub fn read_permissions() -> Result<PermissionsState, String> {
    let settings = read_settings_json()?;
    Ok(extract_permissions(&settings))
}

#[tauri::command]
pub fn update_permissions(
    db: State<'_, Db>,
    permissions: PermissionsState,
) -> Result<(), String> {
    let mut settings = read_settings_json()?;
    let old_perms = extract_permissions(&settings);
    apply_permissions_to_settings(&mut settings, &permissions)?;
    write_settings_json(&settings)?;

    let details = serde_json::json!({
        "before": serde_json::to_value(&old_perms).unwrap_or_default(),
        "after": serde_json::to_value(&permissions).unwrap_or_default(),
    });
    log_audit(
        &db,
        "permission_change",
        "permissions",
        "Permissions updated manually",
        Some(&details.to_string()),
        "user",
    );

    Ok(())
}

#[tauri::command]
pub fn list_security_presets() -> Result<Vec<SecurityPreset>, String> {
    Ok(get_presets())
}

#[tauri::command]
pub fn apply_security_preset(
    db: State<'_, Db>,
    preset_id: String,
    confirm_drop_deny: Option<bool>,
) -> Result<PresetOutcome, String> {
    let presets = get_presets();
    let preset = presets
        .iter()
        .find(|p| p.id == preset_id)
        .ok_or_else(|| format!("Unknown preset: {}", preset_id))?;

    let (outcome, old_perms) =
        apply_preset_at(&settings_path()?, &preset.permissions, confirm_drop_deny.unwrap_or(false))?;
    if !outcome.applied {
        return Ok(outcome);
    }

    let details = serde_json::json!({
        "preset": preset_id,
        "before": serde_json::to_value(&old_perms).unwrap_or_default(),
        "after": serde_json::to_value(&preset.permissions).unwrap_or_default(),
        "droppedDeny": outcome.dropped_deny,
    });
    log_audit(
        &db,
        "preset_applied",
        "permissions",
        &format!("Applied '{}' security preset", preset.name),
        Some(&details.to_string()),
        "preset",
    );

    Ok(outcome)
}

#[tauri::command]
pub async fn list_required_env(app: AppHandle) -> Result<Vec<KeychainSecretInfo>, String> {
    // Scan installed plugin manifests for requires.env
    let home = dirs::home_dir().ok_or("No home directory")?;
    let plugins_dir = home.join(".claude").join("plugins");
    let mut secrets = Vec::new();

    if !plugins_dir.exists() {
        return Ok(secrets);
    }

    let entries = std::fs::read_dir(&plugins_dir)
        .map_err(|e| format!("Failed to read plugins dir: {}", e))?;

    for entry in entries.flatten() {
        let manifest_path = entry.path().join(".claude-plugin").join("plugin.json");
        if !manifest_path.exists() {
            continue;
        }
        let content = match std::fs::read_to_string(&manifest_path) {
            Ok(c) => c,
            Err(_) => continue,
        };
        let manifest: serde_json::Value = match serde_json::from_str(&content) {
            Ok(v) => v,
            Err(_) => continue,
        };

        let plugin_name = manifest.get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown")
            .to_string();

        if let Some(env_arr) = manifest
            .get("requires")
            .and_then(|r| r.get("env"))
            .and_then(|e| e.as_array())
        {
            for env_entry in env_arr {
                let sensitive = env_entry.get("sensitive")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);
                if sensitive {
                    secrets.push(KeychainSecretInfo {
                        name: env_entry.get("name")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string(),
                        description: env_entry.get("description")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string(),
                        required: env_entry.get("required")
                            .and_then(|v| v.as_bool())
                            .unwrap_or(false),
                        is_set: false,
                        plugin_name: Some(plugin_name.clone()),
                    });
                }
            }
        }
    }

    // Check keychain for each secret
    let shell = app.shell();
    for secret in &mut secrets {
        if secret.name.is_empty() {
            continue;
        }
        let output = shell
            .command("security")
            .args(["find-generic-password", "-a", "harness-kit", "-s", &secret.name])
            .output()
            .await;
        secret.is_set = output.map(|o| o.status.success()).unwrap_or(false);
    }

    Ok(secrets)
}

/// Account name under which every HarnessKit secret is stored; the secret
/// name is the keychain service. Unchanged so existing items still read.
const KEYCHAIN_ACCOUNT: &str = "harness-kit";

/// Where secret values go. The production impl calls the Security framework
/// in-process, so the value never appears in any process's argv.
trait SecretStore {
    fn set(&self, service: &str, account: &str, value: &[u8]) -> Result<(), String>;
}

struct SystemKeychain;

#[cfg(target_os = "macos")]
impl SecretStore for SystemKeychain {
    fn set(&self, service: &str, account: &str, value: &[u8]) -> Result<(), String> {
        security_framework::passwords::set_generic_password(service, account, value)
            .map_err(|e| format!("Keychain error: {}", e))
    }
}

#[cfg(not(target_os = "macos"))]
impl SecretStore for SystemKeychain {
    fn set(&self, _: &str, _: &str, _: &[u8]) -> Result<(), String> {
        Err("Keychain storage is only available on macOS".to_string())
    }
}

fn store_secret(store: &dyn SecretStore, name: &str, value: &str) -> Result<(), String> {
    validate_secret_name(name)?;
    store.set(name, KEYCHAIN_ACCOUNT, value.as_bytes())
}

#[tauri::command]
pub async fn set_keychain_secret(
    db: State<'_, Db>,
    name: String,
    value: String,
) -> Result<(), String> {
    validate_secret_name(&name)?;

    let stored_name = name.clone();
    tokio::task::spawn_blocking(move || store_secret(&SystemKeychain, &stored_name, &value))
        .await
        .map_err(|e| format!("Keychain task failed: {}", e))??;

    log_audit(
        &db,
        "secret_access",
        "secrets",
        &format!("Secret '{}' set in keychain", name),
        None,
        "user",
    );

    Ok(())
}

#[tauri::command]
pub async fn delete_keychain_secret(
    app: AppHandle,
    db: State<'_, Db>,
    name: String,
) -> Result<(), String> {
    validate_secret_name(&name)?;

    let shell = app.shell();
    let output = shell
        .command("security")
        .args(["delete-generic-password", "-a", "harness-kit", "-s", &name])
        .output()
        .await
        .map_err(|e| format!("Failed to run security command: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Keychain error: {}", stderr));
    }

    log_audit(
        &db,
        "secret_delete",
        "secrets",
        &format!("Secret '{}' deleted from keychain", name),
        None,
        "user",
    );

    Ok(())
}

#[tauri::command]
pub fn read_env_config() -> Result<Vec<EnvConfigEntry>, String> {
    let path = env_config_path()?;
    if !path.exists() {
        return Ok(vec![]);
    }
    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read env.json: {}", e))?;
    let entries: Vec<EnvConfigEntry> = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse env.json: {}", e))?;
    Ok(entries)
}

#[tauri::command]
pub fn write_env_config(
    db: State<'_, Db>,
    entries: Vec<EnvConfigEntry>,
) -> Result<(), String> {
    let path = env_config_path()?;

    // Ensure parent directory exists
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    let content = serde_json::to_string_pretty(&entries)
        .map_err(|e| format!("Failed to serialize env config: {}", e))?;
    std::fs::write(&path, content)
        .map_err(|e| format!("Failed to write env.json: {}", e))?;

    log_audit(
        &db,
        "permission_change",
        "secrets",
        "Environment config updated",
        None,
        "user",
    );

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;

    fn preset(allow: &[&str], deny: &[&str], ask: &[&str]) -> PermissionsState {
        let v = |x: &[&str]| x.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        PermissionsState {
            tools: ToolPermissions { allow: v(allow), deny: v(deny), ask: v(ask) },
            paths: PathPermissions { writable: vec![], readonly: vec![] },
            network: NetworkPermissions { allowed_hosts: vec![] },
        }
    }

    const SETTINGS: &str = r#"{
  "zeta": {
    "b": 1,
    "a": [
      3,
      2,
      1
    ]
  },
  "permissions": {
    "deny": [
      "Bash(rm:*)"
    ],
    "allow": [
      "Read",
      "Zed"
    ]
  },
  "alpha": true
}
"#;

    fn write_fixture(dir: &std::path::Path, body: &str) -> std::path::PathBuf {
        let path = dir.join(".claude").join("settings.json");
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(&path, body).unwrap();
        path
    }

    #[test]
    fn merge_keeps_existing_rules_in_order_and_appends_new() {
        let dir = tempfile::tempdir().unwrap();
        let path = write_fixture(dir.path(), SETTINGS);
        let (out, _) = apply_preset_at(&path, &preset(&["Edit", "Read"], &[], &["Grep"]), false).unwrap();
        assert!(out.applied);
        let v = read_settings_at(&path).unwrap();
        assert_eq!(extract_string_array(&v, &["permissions", "allow"]), ["Read", "Zed", "Edit"]);
        assert_eq!(extract_string_array(&v, &["permissions", "deny"]), ["Bash(rm:*)"]);
        assert_eq!(extract_string_array(&v, &["permissions", "ask"]), ["Grep"]);
    }

    #[test]
    fn preset_dropping_a_deny_returns_it_without_writing() {
        let dir = tempfile::tempdir().unwrap();
        let path = write_fixture(dir.path(), SETTINGS);
        let (out, _) = apply_preset_at(&path, &preset(&["*"], &[], &[]), false).unwrap();
        assert!(!out.applied);
        assert_eq!(out.dropped_deny, ["Bash(rm:*)"]);
        assert_eq!(std::fs::read_to_string(&path).unwrap(), SETTINGS);
        let baks = std::fs::read_dir(path.parent().unwrap()).unwrap().count();
        assert_eq!(baks, 1, "no backup or temp file when nothing is written");
    }

    #[test]
    fn confirmed_preset_removes_the_listed_deny_and_writes() {
        let dir = tempfile::tempdir().unwrap();
        let path = write_fixture(dir.path(), SETTINGS);
        let (out, _) = apply_preset_at(&path, &preset(&["Bash(rm:*)"], &[], &[]), true).unwrap();
        assert!(out.applied);
        assert_eq!(out.dropped_deny, ["Bash(rm:*)"]);
        let v = read_settings_at(&path).unwrap();
        assert!(extract_string_array(&v, &["permissions", "deny"]).is_empty());
    }

    #[test]
    fn untouched_keys_keep_order_and_bytes() {
        let dir = tempfile::tempdir().unwrap();
        let path = write_fixture(dir.path(), SETTINGS);
        apply_preset_at(&path, &preset(&["Edit"], &[], &[]), false).unwrap();
        let after = std::fs::read_to_string(&path).unwrap();
        let zeta = &SETTINGS[SETTINGS.find("  \"zeta\"").unwrap()..SETTINGS.find("  \"permissions\"").unwrap()];
        assert!(after.contains(zeta), "zeta block changed:\n{}", after);
        assert!(after.contains("  \"alpha\": true\n}"));
        assert!(after.ends_with("}\n"));
        let pos = |k: &str| after.find(k).unwrap();
        assert!(pos("\"zeta\"") < pos("\"permissions\"") && pos("\"permissions\"") < pos("\"alpha\""));
        assert!(pos("\"deny\"") < pos("\"allow\""), "keys inside permissions reordered");
    }

    #[test]
    fn write_creates_private_timestamped_backup_and_private_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = write_fixture(dir.path(), SETTINGS);
        apply_preset_at(&path, &preset(&["Edit"], &[], &[]), false).unwrap();
        let backups: Vec<_> = std::fs::read_dir(path.parent().unwrap())
            .unwrap()
            .flatten()
            .filter(|e| e.file_name().to_string_lossy().starts_with("settings.json.bak-"))
            .collect();
        assert_eq!(backups.len(), 1);
        assert_eq!(std::fs::read_to_string(backups[0].path()).unwrap(), SETTINGS);
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = |p: &std::path::Path| std::fs::metadata(p).unwrap().permissions().mode() & 0o777;
            assert_eq!(mode(&path), 0o600);
            assert_eq!(mode(&backups[0].path()), 0o600);
        }
        let leftovers = std::fs::read_dir(path.parent().unwrap())
            .unwrap()
            .flatten()
            .filter(|e| e.file_name().to_string_lossy().starts_with(".hk-tmp-"))
            .count();
        assert_eq!(leftovers, 0);
    }

    #[test]
    fn non_array_rules_are_not_clobbered() {
        let dir = tempfile::tempdir().unwrap();
        let body = r#"{"permissions":{"allow":"oops"}}"#;
        let path = write_fixture(dir.path(), body);
        assert!(apply_preset_at(&path, &preset(&["Edit"], &[], &[]), false).is_err());
        assert_eq!(std::fs::read_to_string(&path).unwrap(), body);
    }

    struct FakeStore(RefCell<Vec<(String, String, Vec<u8>)>>);
    impl SecretStore for FakeStore {
        fn set(&self, s: &str, a: &str, v: &[u8]) -> Result<(), String> {
            self.0.borrow_mut().push((s.into(), a.into(), v.to_vec()));
            Ok(())
        }
    }

    #[test]
    fn secret_goes_to_the_store_with_legacy_service_and_account() {
        let store = FakeStore(RefCell::new(vec![]));
        store_secret(&store, "API_KEY", "s3cret").unwrap();
        let calls = store.0.borrow();
        assert_eq!(calls.len(), 1);
        assert_eq!((calls[0].0.as_str(), calls[0].1.as_str()), ("API_KEY", "harness-kit"));
        assert_eq!(calls[0].2, b"s3cret");
    }

    #[test]
    fn invalid_secret_name_never_reaches_the_store() {
        let store = FakeStore(RefCell::new(vec![]));
        assert!(store_secret(&store, "bad name; rm", "x").is_err());
        assert!(store.0.borrow().is_empty());
    }

    #[test]
    fn keychain_path_has_no_command_line_value() {
        // Structural guard: the security CLI must not appear with a -w value.
        let src = include_str!("security.rs");
        let code = src.split("#[cfg(test)]").next().unwrap();
        assert!(!code.contains("add-generic-password"));
    }
}
