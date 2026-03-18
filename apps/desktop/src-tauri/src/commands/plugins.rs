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
    let plugins_dir = claude_dir()
        .ok_or_else(|| "Could not resolve home directory".to_string())?
        .join("plugins");

    // Remove plugin directory
    let plugin_dir = plugins_dir.join(&name);
    if plugin_dir.exists() {
        std::fs::remove_dir_all(&plugin_dir)
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

        std::fs::write(&json_path, serde_json::to_string_pretty(&data).unwrap())
            .map_err(|e| format!("Failed to update installed_plugins.json: {}", e))?;
    }

    Ok(())
}
