use serde::{Deserialize, Serialize};
use std::collections::HashMap;

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

fn read_plugin_category_tags(install_path: &str) -> (Option<String>, Option<Vec<String>>) {
    let manifest_path = std::path::Path::new(install_path)
        .join(".claude-plugin")
        .join("plugin.json");
    let contents = match std::fs::read_to_string(&manifest_path) {
        Ok(c) => c,
        Err(_) => return (None, None),
    };
    match serde_json::from_str::<RawPluginManifest>(&contents) {
        Ok(m) => (m.category, m.tags),
        Err(_) => (None, None),
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
            let (category, tags) = record.install_path.as_deref()
                .map(read_plugin_category_tags)
                .unwrap_or((None, None));
            Some(InstalledPlugin {
                name,
                version: record.version,
                description: None,
                marketplace,
                source: record.install_path,
                installed_at: record.installed_at,
                category,
                tags,
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
