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
    let path = settings_path()?;
    if !path.exists() {
        return Ok(serde_json::json!({}));
    }
    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read settings.json: {}", e))?;
    serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse settings.json: {}", e))
}

fn write_settings_json(value: &serde_json::Value) -> Result<(), String> {
    let path = settings_path()?;

    // Create backup
    if path.exists() {
        let backup = path.with_extension("json.bak");
        std::fs::copy(&path, &backup)
            .map_err(|e| format!("Failed to create backup: {}", e))?;
    }

    // Ensure parent directory exists
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    let content = serde_json::to_string_pretty(value)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;
    std::fs::write(&path, content)
        .map_err(|e| format!("Failed to write settings.json: {}", e))
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
) -> Result<(), String> {
    let presets = get_presets();
    let preset = presets
        .iter()
        .find(|p| p.id == preset_id)
        .ok_or_else(|| format!("Unknown preset: {}", preset_id))?;

    let mut settings = read_settings_json()?;
    let old_perms = extract_permissions(&settings);
    apply_permissions_to_settings(&mut settings, &preset.permissions)?;
    write_settings_json(&settings)?;

    let details = serde_json::json!({
        "preset": preset_id,
        "before": serde_json::to_value(&old_perms).unwrap_or_default(),
        "after": serde_json::to_value(&preset.permissions).unwrap_or_default(),
    });
    log_audit(
        &db,
        "preset_applied",
        "permissions",
        &format!("Applied '{}' security preset", preset.name),
        Some(&details.to_string()),
        "preset",
    );

    Ok(())
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

#[tauri::command]
pub async fn set_keychain_secret(
    app: AppHandle,
    db: State<'_, Db>,
    name: String,
    value: String,
) -> Result<(), String> {
    validate_secret_name(&name)?;

    let shell = app.shell();
    let output = shell
        .command("security")
        .args(["add-generic-password", "-a", "harness-kit", "-s", &name, "-w", &value, "-U"])
        .output()
        .await
        .map_err(|e| format!("Failed to run security command: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Keychain error: {}", stderr));
    }

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
