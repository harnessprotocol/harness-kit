use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ComponentCounts {
    pub skills: u32,
    pub agents: u32,
    pub scripts: u32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct InstalledPlugin {
    pub name: String,
    pub version: String,
    pub description: Option<String>,
    pub marketplace: Option<String>,
    pub source: Option<String>,
    pub installed_at: Option<String>,
    pub category: Option<String>,
    pub tags: Option<Vec<String>>,
    pub component_counts: Option<ComponentCounts>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct KnownMarketplace {
    pub name: String,
    pub url: String,
    pub description: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PluginUpdateInfo {
    pub name: String,
    pub installed_version: String,
    pub latest_version: String,
    pub marketplace: String,
}

// Actual shape of each entry in the plugins map
#[derive(Debug, Deserialize)]
struct RawPluginRecord {
    version: String,
    #[serde(rename = "installedAt")]
    installed_at: Option<String>,
    #[serde(rename = "installPath")]
    install_path: Option<String>,
}

// Actual shape of installed_plugins.json
#[derive(Debug, Deserialize)]
struct RawInstalledPlugins {
    plugins: HashMap<String, Vec<RawPluginRecord>>,
}

// Shape of .claude-plugin/plugin.json (only fields we need)
#[derive(Debug, Deserialize)]
struct RawPluginManifest {
    description: Option<String>,
    category: Option<String>,
    tags: Option<Vec<String>>,
}

struct PluginManifestFields {
    description: Option<String>,
    category: Option<String>,
    tags: Option<Vec<String>>,
}

// Shape of a plugin entry in a marketplace manifest
#[derive(Debug, Deserialize)]
struct RawMarketplacePlugin {
    name: String,
    version: String,
}

// Shape of a marketplace manifest file
#[derive(Debug, Deserialize)]
struct RawMarketplaceManifest {
    name: String,
    plugins: Vec<RawMarketplacePlugin>,
}

fn claude_dir() -> Option<std::path::PathBuf> {
    dirs::home_dir().map(|h| h.join(".claude"))
}

fn count_subdirectory_entries(install_path: &str, subdir: &str) -> u32 {
    let path = std::path::Path::new(install_path).join(subdir);
    match std::fs::read_dir(path) {
        Ok(entries) => entries.filter_map(|e| e.ok()).count() as u32,
        Err(_) => 0,
    }
}

fn count_components(install_path: &str) -> ComponentCounts {
    ComponentCounts {
        skills: count_subdirectory_entries(install_path, "skills"),
        agents: count_subdirectory_entries(install_path, "agents"),
        scripts: count_subdirectory_entries(install_path, "scripts"),
    }
}

fn read_plugin_manifest_fields(install_path: &str) -> PluginManifestFields {
    let empty = PluginManifestFields { description: None, category: None, tags: None };
    let manifest_path = std::path::Path::new(install_path)
        .join(".claude-plugin")
        .join("plugin.json");
    let contents = match std::fs::read_to_string(&manifest_path) {
        Ok(c) => c,
        Err(_) => return empty,
    };
    match serde_json::from_str::<RawPluginManifest>(&contents) {
        Ok(m) => PluginManifestFields { description: m.description, category: m.category, tags: m.tags },
        Err(_) => empty,
    }
}

#[tauri::command]
pub fn list_installed_plugins() -> Result<Vec<InstalledPlugin>, String> {
    let path = claude_dir()
        .ok_or_else(|| "Could not resolve home directory".to_string())?
        .join("plugins")
        .join("installed_plugins.json");

    if !path.exists() {
        return Ok(vec![]);
    }

    let contents = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read {}: {}", path.display(), e))?;

    let raw: RawInstalledPlugins = serde_json::from_str(&contents)
        .map_err(|e| format!("Failed to parse installed_plugins.json: {}", e))?;

    let mut result: Vec<InstalledPlugin> = raw
        .plugins
        .into_iter()
        .filter_map(|(key, records)| {
            let record = records.into_iter().next()?;
            let (name, marketplace) = match key.find('@') {
                Some(idx) => (key[..idx].to_string(), Some(key[idx + 1..].to_string())),
                None => (key, None),
            };
            let fields = record.install_path.as_deref()
                .map(read_plugin_manifest_fields)
                .unwrap_or(PluginManifestFields { description: None, category: None, tags: None });
            let counts = record.install_path.as_deref().map(count_components);
            Some(InstalledPlugin {
                name,
                version: record.version,
                description: fields.description,
                marketplace,
                source: record.install_path,
                installed_at: record.installed_at,
                category: fields.category,
                tags: fields.tags,
                component_counts: counts,
            })
        })
        .collect();

    result.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(result)
}

#[tauri::command]
pub fn list_marketplaces() -> Result<Vec<KnownMarketplace>, String> {
    let path = claude_dir()
        .ok_or_else(|| "Could not resolve home directory".to_string())?
        .join("plugins")
        .join("marketplaces.json");

    if !path.exists() {
        return Ok(vec![]);
    }

    let contents = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read {}: {}", path.display(), e))?;

    serde_json::from_str::<Vec<KnownMarketplace>>(&contents)
        .map_err(|e| format!("Failed to parse marketplaces.json: {}", e))
}

#[tauri::command]
pub fn check_plugin_updates() -> Result<Vec<PluginUpdateInfo>, String> {
    let installed = list_installed_plugins()?;

    let marketplaces_dir = claude_dir()
        .ok_or_else(|| "Could not resolve home directory".to_string())?
        .join("plugins")
        .join("marketplaces");

    if !marketplaces_dir.exists() {
        return Ok(vec![]);
    }

    // Build map: marketplace_name -> (plugin_name -> latest_version)
    let mut latest: HashMap<String, HashMap<String, String>> = HashMap::new();

    let entries = std::fs::read_dir(&marketplaces_dir)
        .map_err(|e| format!("Failed to read marketplaces directory: {}", e))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let contents = match std::fs::read_to_string(&path) {
            Ok(c) => c,
            Err(_) => continue,
        };
        let manifest: RawMarketplaceManifest = match serde_json::from_str(&contents) {
            Ok(m) => m,
            Err(_) => continue,
        };
        let plugin_map = latest.entry(manifest.name).or_default();
        for plugin in manifest.plugins {
            plugin_map.insert(plugin.name, plugin.version);
        }
    }

    let updates: Vec<PluginUpdateInfo> = installed
        .into_iter()
        .filter_map(|plugin| {
            let marketplace = plugin.marketplace.as_ref()?;
            let plugin_map = latest.get(marketplace)?;
            let latest_version = plugin_map.get(&plugin.name)?;
            if latest_version == &plugin.version {
                return None;
            }
            Some(PluginUpdateInfo {
                name: plugin.name,
                installed_version: plugin.version,
                latest_version: latest_version.clone(),
                marketplace: marketplace.clone(),
            })
        })
        .collect();

    Ok(updates)
}

#[tauri::command]
pub fn uninstall_plugin(name: String) -> Result<(), String> {
    // Validate name doesn't contain path traversal characters
    if name.contains('/') || name.contains('\\') || name.contains("..") {
        return Err("Invalid plugin name".to_string());
    }

    let plugins_dir = claude_dir()
        .ok_or_else(|| "Could not resolve home directory".to_string())?
        .join("plugins");

    // Remove plugin directory — canonicalize before removal to block symlink traversal
    let plugin_dir = plugins_dir.join(&name);
    if plugin_dir.exists() {
        let canonical = plugin_dir.canonicalize()
            .map_err(|e| format!("Invalid plugin path: {}", e))?;
        let canonical_plugins = plugins_dir.canonicalize()
            .map_err(|e| format!("Invalid plugins dir: {}", e))?;
        if !canonical.starts_with(&canonical_plugins) {
            return Err("Access denied: plugin path outside plugins directory".to_string());
        }
        std::fs::remove_dir_all(&canonical)
            .map_err(|e| format!("Failed to remove plugin directory: {}", e))?;
    }

    // Remove from installed_plugins.json
    let json_path = plugins_dir.join("installed_plugins.json");
    if json_path.exists() {
        let contents = std::fs::read_to_string(&json_path)
            .map_err(|e| format!("Failed to read installed_plugins.json: {}", e))?;
        let mut data: serde_json::Value = serde_json::from_str(&contents)
            .map_err(|e| format!("Failed to parse installed_plugins.json: {}", e))?;

        if let Some(plugins) = data.get_mut("plugins").and_then(|p| p.as_object_mut()) {
            // Remove any key matching the name (with or without @marketplace suffix)
            let keys_to_remove: Vec<String> = plugins
                .keys()
                .filter(|k| {
                    let base = k.find('@').map_or(k.as_str(), |i| &k[..i]);
                    base == name
                })
                .cloned()
                .collect();
            for key in keys_to_remove {
                plugins.remove(&key);
            }
        }

        let serialized = serde_json::to_string_pretty(&data).unwrap();
        let tmp_path = json_path.with_extension("json.tmp");
        std::fs::write(&tmp_path, &serialized)
            .map_err(|e| format!("Failed to write installed_plugins.json: {}", e))?;
        std::fs::rename(&tmp_path, &json_path)
            .map_err(|e| format!("Failed to finalize installed_plugins.json: {}", e))?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;
    use tempfile::TempDir;

    fn with_home(dir: &TempDir, f: impl FnOnce()) {
        // Hold the crate-level lock so parallel tests don't race on HOME.
        let _guard = crate::HOME_LOCK.lock().unwrap();
        let old = env::var("HOME").ok();
        env::set_var("HOME", dir.path());
        f();
        match old {
            Some(v) => env::set_var("HOME", v),
            None => env::remove_var("HOME"),
        }
    }

    #[test]
    fn list_installed_plugins_returns_empty_when_file_absent() {
        let dir = TempDir::new().unwrap();
        with_home(&dir, || {
            let result = list_installed_plugins().unwrap();
            assert_eq!(result.len(), 0);
        });
    }

    #[test]
    fn list_installed_plugins_returns_correct_count_when_file_exists() {
        let dir = TempDir::new().unwrap();
        let plugins_dir = dir.path().join(".claude").join("plugins");
        std::fs::create_dir_all(&plugins_dir).unwrap();
        let json = r#"{
            "plugins": {
                "research@harness-kit": [
                    {"version": "0.3.0", "installedAt": "2024-01-01T00:00:00Z", "installPath": null}
                ],
                "explain@harness-kit": [
                    {"version": "0.1.0", "installedAt": "2024-01-02T00:00:00Z", "installPath": null}
                ],
                "orient@harness-kit": [
                    {"version": "0.2.0", "installedAt": "2024-01-03T00:00:00Z", "installPath": null}
                ]
            }
        }"#;
        std::fs::write(plugins_dir.join("installed_plugins.json"), json).unwrap();
        with_home(&dir, || {
            let result = list_installed_plugins().unwrap();
            assert_eq!(result.len(), 3);
            // Results are sorted by name
            assert_eq!(result[0].name, "explain");
            assert_eq!(result[0].version, "0.1.0");
            assert_eq!(result[0].marketplace.as_deref(), Some("harness-kit"));
            assert_eq!(result[1].name, "orient");
            assert_eq!(result[2].name, "research");
            assert_eq!(result[2].version, "0.3.0");
        });
    }
}
