use super::surface_write::{precondition_digest, write_user_file};
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

/// Resolve `~/.claude`. The `*_in` variants below take this directory as a
/// parameter so tests can pass a tempdir instead of mutating the
/// process-global `HOME`.
fn claude_dir() -> Result<std::path::PathBuf, String> {
    dirs::home_dir()
        .map(|h| h.join(".claude"))
        .ok_or_else(|| "Could not resolve home directory".to_string())
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
    list_installed_plugins_in(&claude_dir()?)
}

fn list_installed_plugins_in(claude_dir: &std::path::Path) -> Result<Vec<InstalledPlugin>, String> {
    let path = claude_dir
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
    list_marketplaces_in(&claude_dir()?)
}

fn list_marketplaces_in(claude_dir: &std::path::Path) -> Result<Vec<KnownMarketplace>, String> {
    let path = claude_dir
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
    check_plugin_updates_in(&claude_dir()?)
}

fn check_plugin_updates_in(claude_dir: &std::path::Path) -> Result<Vec<PluginUpdateInfo>, String> {
    let installed = list_installed_plugins_in(claude_dir)?;

    let marketplaces_dir = claude_dir
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
    uninstall_plugin_in(&claude_dir()?, name)
}

const RESERVED_PLUGIN_NAMES: [&str; 3] = ["cache", "data", "marketplaces"];

/// Reject names that are empty, `.`/`..`, reserved directory names, or contain
/// path separators. Applied to the whole argument and to its name part.
fn validate_plugin_name(part: &str) -> Result<(), String> {
    let trimmed = part.trim();
    if trimmed.is_empty() || trimmed == "." || trimmed == ".." {
        return Err(format!("Invalid plugin name: {:?}", part));
    }
    if trimmed.contains('/') || trimmed.contains('\\') || trimmed.contains("..") {
        return Err(format!("Invalid plugin name: {:?}", part));
    }
    if RESERVED_PLUGIN_NAMES.contains(&trimmed) {
        return Err(format!("Refusing to uninstall reserved name {:?}", part));
    }
    Ok(())
}

/// Find `name` among the `installed_plugins.json` keys. Only the full
/// `name@marketplace` key matches: a bare name is refused, because it would
/// pick a record the caller did not name when two marketplaces ship the same
/// plugin.
fn resolve_plugin_key(
    plugins: &serde_json::Map<String, serde_json::Value>,
    name: &str,
) -> Result<Option<String>, String> {
    if !name.contains('@') {
        return Err(format!(
            "Plugin {:?} must be given as its full name@marketplace key",
            name
        ));
    }
    Ok(plugins.contains_key(name).then(|| name.to_string()))
}

/// Split a full key into its name and marketplace parts, each of which must
/// be a single safe path segment: they name the one directory
/// (`cache/<marketplace>/<name>`) an uninstall may delete.
fn split_plugin_key(key: &str) -> Result<(&str, &str), String> {
    let (name, marketplace) = key
        .split_once('@')
        .ok_or_else(|| format!("Plugin {:?} must be given as its full name@marketplace key", key))?;
    validate_plugin_name(name)?;
    let trimmed = marketplace.trim();
    if trimmed.is_empty()
        || trimmed == "."
        || trimmed == ".."
        || marketplace != trimmed
        || marketplace.contains(['/', '\\'])
        || marketplace.contains("..")
    {
        return Err(format!("Invalid marketplace name: {:?}", marketplace));
    }
    Ok((name, marketplace))
}

fn uninstall_plugin_in(claude_dir: &std::path::Path, name: String) -> Result<(), String> {
    uninstall_plugin_with(claude_dir, name, || {})
}

/// As above; `before_write` runs after the file was read and every path
/// validated, just before the record is rewritten (a test seam for a
/// concurrent writer).
fn uninstall_plugin_with(
    claude_dir: &std::path::Path,
    name: String,
    before_write: impl FnOnce(),
) -> Result<(), String> {
    validate_plugin_name(&name)?;
    if let Some(base) = name.find('@').map(|i| &name[..i]) {
        validate_plugin_name(base)?;
    }

    let plugins_dir = claude_dir.join("plugins");
    let json_path = plugins_dir.join("installed_plugins.json");
    if !json_path.exists() {
        return Ok(());
    }

    let contents = std::fs::read_to_string(&json_path)
        .map_err(|e| format!("Failed to read installed_plugins.json: {}", e))?;
    let mut data: serde_json::Value = serde_json::from_str(&contents)
        .map_err(|e| format!("Failed to parse installed_plugins.json: {}", e))?;

    let key = match data
        .get("plugins")
        .and_then(|p| p.as_object())
        .map(|p| resolve_plugin_key(p, &name))
        .transpose()?
        .flatten()
    {
        Some(k) => k,
        None => return Ok(()),
    };

    // Delete only this record's own installPath, and only when it resolves to
    // plugins/cache/<marketplace>/<name> or beneath it, with marketplace and
    // name taken from the key. Canonicalize first to block symlinks and `..`.
    let (key_name, key_marketplace) = split_plugin_key(&key)?;
    let install_paths: Vec<String> = data["plugins"][&key]
        .as_array()
        .map(|records| {
            records
                .iter()
                .filter_map(|r| r.get("installPath").and_then(|p| p.as_str()))
                .map(String::from)
                .collect()
        })
        .unwrap_or_default();

    let own_dir = plugins_dir.join("cache").join(key_marketplace).join(key_name);
    let mut to_remove = Vec::new();
    for install_path in &install_paths {
        let path = std::path::Path::new(install_path);
        if !path.exists() {
            continue;
        }
        let canonical = path.canonicalize()
            .map_err(|e| format!("Invalid plugin path: {}", e))?;
        let canonical_own = own_dir.canonicalize()
            .map_err(|e| format!("Invalid plugin cache dir: {}", e))?;
        if !canonical.starts_with(&canonical_own) {
            return Err(format!(
                "Access denied: plugin path is not inside plugins/cache/{}/{}",
                key_marketplace, key_name
            ));
        }
        to_remove.push(canonical);
    }
    // Every path is validated above. Remove the record first: if that write is
    // refused (the file changed since it was read; the claude CLI also writes
    // it), nothing has been deleted.
    if let Some(plugins) = data.get_mut("plugins").and_then(|p| p.as_object_mut()) {
        plugins.remove(&key);
    }
    let serialized = serde_json::to_string_pretty(&data)
        .map_err(|e| format!("Failed to serialize installed_plugins.json: {}", e))?;
    let loaded = precondition_digest(contents.as_bytes());
    before_write();
    write_user_file(&json_path, &serialized, Some(&loaded))
        .map_err(|e| format!("Failed to write installed_plugins.json: {}", e))?;

    // The record is gone; a failed delete leaves a directory with no record,
    // so name it.
    for canonical in to_remove {
        std::fs::remove_dir_all(&canonical).map_err(|e| {
            format!(
                "Plugin removed from installed_plugins.json, but its directory {} could not be deleted: {}",
                canonical.display(),
                e
            )
        })?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn list_installed_plugins_returns_empty_when_file_absent() {
        let dir = TempDir::new().unwrap();
        let result = list_installed_plugins_in(&dir.path().join(".claude")).unwrap();
        assert_eq!(result.len(), 0);
    }

    #[test]
    fn list_installed_plugins_returns_correct_count_when_file_exists() {
        let dir = TempDir::new().unwrap();
        let claude = dir.path().join(".claude");
        let plugins_dir = claude.join("plugins");
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
        let result = list_installed_plugins_in(&claude).unwrap();
        assert_eq!(result.len(), 3);
        // Results are sorted by name
        assert_eq!(result[0].name, "explain");
        assert_eq!(result[0].version, "0.1.0");
        assert_eq!(result[0].marketplace.as_deref(), Some("harness-kit"));
        assert_eq!(result[1].name, "orient");
        assert_eq!(result[2].name, "research");
        assert_eq!(result[2].version, "0.3.0");
    }

    // --- uninstall_plugin_in ---

    /// Build `<tmp>/.claude/plugins` with a cache dir, a sentinel file in the
    /// plugins dir and the given installed_plugins.json body.
    fn uninstall_fixture(json: &str) -> (TempDir, std::path::PathBuf) {
        let dir = TempDir::new().unwrap();
        let claude = dir.path().join(".claude");
        let plugins = claude.join("plugins");
        std::fs::create_dir_all(plugins.join("cache")).unwrap();
        std::fs::write(plugins.join("cache").join("keep.txt"), "x").unwrap();
        std::fs::write(plugins.join("installed_plugins.json"), json).unwrap();
        (dir, claude)
    }

    fn make_install(claude: &std::path::Path, rel: &str) -> std::path::PathBuf {
        let p = claude.join("plugins").join("cache").join(rel);
        std::fs::create_dir_all(&p).unwrap();
        std::fs::write(p.join("marker"), "x").unwrap();
        p
    }

    fn record(path: &std::path::Path) -> String {
        format!(
            r#"[{{"version":"1.0.0","installedAt":"2024-01-01T00:00:00Z","installPath":{}}}]"#,
            serde_json::to_string(path.to_str().unwrap()).unwrap()
        )
    }

    #[test]
    fn uninstall_refuses_reserved_and_degenerate_names() {
        let (_d, claude) = uninstall_fixture(r#"{"plugins":{}}"#);
        for bad in ["cache", "data", "marketplaces", ".", "..", "", "cache@x", "a/b"] {
            let err = uninstall_plugin_in(&claude, bad.to_string()).unwrap_err();
            assert!(!err.is_empty(), "{bad:?} should be refused");
        }
        assert!(claude.join("plugins").join("cache").join("keep.txt").exists());
    }

    #[test]
    fn uninstall_happy_path_deletes_only_own_install_path() {
        let (d, claude) = uninstall_fixture(r#"{"plugins":{}}"#);
        let a = make_install(&claude, "mkt/alpha/1.0.0");
        let b = make_install(&claude, "mkt/beta/1.0.0");
        let json = format!(
            r#"{{"plugins":{{"alpha@mkt":{},"beta@mkt":{}}}}}"#,
            record(&a),
            record(&b)
        );
        std::fs::write(claude.join("plugins").join("installed_plugins.json"), json).unwrap();
        uninstall_plugin_in(&claude, "alpha@mkt".to_string()).unwrap();
        assert!(!a.exists());
        assert!(b.exists());
        assert!(claude.join("plugins").join("cache").join("keep.txt").exists());
        let left = list_installed_plugins_in(&claude).unwrap();
        assert_eq!(left.len(), 1);
        assert_eq!(left[0].name, "beta");
        drop(d);
    }

    #[test]
    fn uninstall_same_name_other_marketplace_is_untouched() {
        let (_d, claude) = uninstall_fixture(r#"{"plugins":{}}"#);
        let a = make_install(&claude, "one/tool/1.0.0");
        let b = make_install(&claude, "two/tool/1.0.0");
        let json = format!(
            r#"{{"plugins":{{"tool@one":{},"tool@two":{}}}}}"#,
            record(&a),
            record(&b)
        );
        std::fs::write(claude.join("plugins").join("installed_plugins.json"), &json).unwrap();

        // A bare name is refused whether or not it is ambiguous: delete nothing.
        assert!(uninstall_plugin_in(&claude, "tool".to_string()).is_err());
        assert!(a.exists() && b.exists());

        uninstall_plugin_in(&claude, "tool@one".to_string()).unwrap();
        assert!(!a.exists());
        assert!(b.exists());
        let left = list_installed_plugins_in(&claude).unwrap();
        assert_eq!(left.len(), 1);
        assert_eq!(left[0].marketplace.as_deref(), Some("two"));
    }

    #[test]
    fn uninstall_deletes_nothing_when_the_record_file_changed_after_it_was_read() {
        let (_d, claude) = uninstall_fixture(r#"{"plugins":{}}"#);
        let a = make_install(&claude, "mkt/alpha/1.0.0");
        let json_path = claude.join("plugins").join("installed_plugins.json");
        std::fs::write(
            &json_path,
            format!(r#"{{"plugins":{{"alpha@mkt":{}}}}}"#, record(&a)),
        )
        .unwrap();
        let err = uninstall_plugin_with(&claude, "alpha@mkt".to_string(), || {
            // The claude CLI rewrites the file between our read and our write.
            std::fs::write(&json_path, r#"{"plugins":{"other@mkt":[]}}"#).unwrap();
        })
        .unwrap_err();
        assert!(err.contains("changed on disk"), "got: {err}");
        assert!(a.exists(), "a directory was deleted although the record was not removed");
    }

    #[test]
    fn uninstall_keeps_the_record_removed_and_names_the_leftover_when_a_delete_fails() {
        let (_d, claude) = uninstall_fixture(r#"{"plugins":{}}"#);
        let a = make_install(&claude, "mkt/alpha/1.0.0");
        std::fs::write(
            claude.join("plugins").join("installed_plugins.json"),
            format!(r#"{{"plugins":{{"alpha@mkt":{}}}}}"#, record(&a)),
        )
        .unwrap();
        // A read-only parent makes the delete fail after the record is gone.
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let parent = a.parent().unwrap();
            std::fs::set_permissions(parent, std::fs::Permissions::from_mode(0o500)).unwrap();
            let result = uninstall_plugin_in(&claude, "alpha@mkt".to_string());
            std::fs::set_permissions(parent, std::fs::Permissions::from_mode(0o700)).unwrap();
            if a.exists() {
                let err = result.unwrap_err();
                assert!(err.contains("1.0.0"), "leftover dir not named: {err}");
                assert!(list_installed_plugins_in(&claude).unwrap().is_empty());
            }
        }
    }

    #[test]
    fn uninstall_refuses_a_bare_name_even_when_only_one_key_matches() {
        let (_d, claude) = uninstall_fixture(r#"{"plugins":{}}"#);
        let a = make_install(&claude, "mkt/solo/1.0.0");
        let json = format!(r#"{{"plugins":{{"solo@mkt":{}}}}}"#, record(&a));
        std::fs::write(claude.join("plugins").join("installed_plugins.json"), json).unwrap();
        let err = uninstall_plugin_in(&claude, "solo".to_string()).unwrap_err();
        assert!(err.contains("name@marketplace"), "got: {err}");
        assert!(a.exists());
        assert_eq!(list_installed_plugins_in(&claude).unwrap().len(), 1);
    }

    #[test]
    fn uninstall_refuses_install_path_that_is_a_whole_marketplace_directory() {
        let (_d, claude) = uninstall_fixture(r#"{"plugins":{}}"#);
        let other = make_install(&claude, "mkt/other/1.0.0");
        let market = claude.join("plugins").join("cache").join("mkt");
        let json = format!(r#"{{"plugins":{{"evil@mkt":{}}}}}"#, record(&market));
        std::fs::write(claude.join("plugins").join("installed_plugins.json"), json).unwrap();
        assert!(uninstall_plugin_in(&claude, "evil@mkt".to_string()).is_err());
        assert!(other.exists(), "another plugin in the marketplace was deleted");
        assert_eq!(list_installed_plugins_in(&claude).unwrap().len(), 1);
    }

    #[test]
    fn uninstall_refuses_install_path_inside_another_plugins_directory() {
        let (_d, claude) = uninstall_fixture(r#"{"plugins":{}}"#);
        let other = make_install(&claude, "mkt/other/1.0.0");
        let json = format!(r#"{{"plugins":{{"evil@mkt":{}}}}}"#, record(&other));
        std::fs::write(claude.join("plugins").join("installed_plugins.json"), json).unwrap();
        assert!(uninstall_plugin_in(&claude, "evil@mkt".to_string()).is_err());
        assert!(other.exists());
    }

    #[test]
    fn uninstall_refuses_install_path_in_a_different_marketplace() {
        let (_d, claude) = uninstall_fixture(r#"{"plugins":{}}"#);
        let other = make_install(&claude, "two/tool/1.0.0");
        let json = format!(r#"{{"plugins":{{"tool@one":{}}}}}"#, record(&other));
        std::fs::write(claude.join("plugins").join("installed_plugins.json"), json).unwrap();
        assert!(uninstall_plugin_in(&claude, "tool@one".to_string()).is_err());
        assert!(other.exists());
    }

    #[test]
    fn uninstall_allows_the_plugin_directory_itself() {
        let (_d, claude) = uninstall_fixture(r#"{"plugins":{}}"#);
        let plugin_dir = make_install(&claude, "mkt/alpha");
        let json = format!(r#"{{"plugins":{{"alpha@mkt":{}}}}}"#, record(&plugin_dir));
        std::fs::write(claude.join("plugins").join("installed_plugins.json"), json).unwrap();
        uninstall_plugin_in(&claude, "alpha@mkt".to_string()).unwrap();
        assert!(!plugin_dir.exists());
    }

    #[test]
    fn uninstall_rewrite_backs_up_installed_plugins_and_leaves_no_temp_file() {
        let (d, claude) = uninstall_fixture(r#"{"plugins":{}}"#);
        crate::commands::surface_write::set_test_home(d.path());
        let a = make_install(&claude, "mkt/alpha/1.0.0");
        let json = format!(r#"{{"plugins":{{"alpha@mkt":{}}}}}"#, record(&a));
        let json_path = claude.join("plugins").join("installed_plugins.json");
        std::fs::write(&json_path, &json).unwrap();
        uninstall_plugin_in(&claude, "alpha@mkt".to_string()).unwrap();
        let names: Vec<String> = std::fs::read_dir(claude.join("plugins"))
            .unwrap()
            .flatten()
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .collect();
        assert!(!names.iter().any(|n| n.contains(".bak-")), "backup beside the file: {names:?}");
        let backups = crate::commands::surface_write::user_backups(d.path());
        assert_eq!(backups.len(), 1, "backups: {backups:?}");
        assert!(backups[0].ends_with(".claude/plugins/installed_plugins.json"), "{backups:?}");
        assert_eq!(std::fs::read_to_string(&backups[0]).unwrap(), json);
        assert!(!names.iter().any(|n| n.ends_with(".tmp") || n.starts_with(".hk-tmp-")), "names: {names:?}");
    }

    #[test]
    fn uninstall_refuses_install_path_outside_cache() {
        let (d, claude) = uninstall_fixture(r#"{"plugins":{}}"#);
        let outside = d.path().join("precious");
        std::fs::create_dir_all(&outside).unwrap();
        std::fs::write(outside.join("file"), "x").unwrap();
        let json = format!(r#"{{"plugins":{{"evil@mkt":{}}}}}"#, record(&outside));
        std::fs::write(claude.join("plugins").join("installed_plugins.json"), json).unwrap();
        assert!(uninstall_plugin_in(&claude, "evil@mkt".to_string()).is_err());
        assert!(outside.join("file").exists());
        // Record stays so the user can see the failure.
        assert_eq!(list_installed_plugins_in(&claude).unwrap().len(), 1);
    }

    #[test]
    fn uninstall_refuses_install_path_equal_to_cache() {
        let (_d, claude) = uninstall_fixture(r#"{"plugins":{}}"#);
        let cache = claude.join("plugins").join("cache");
        let json = format!(r#"{{"plugins":{{"evil@mkt":{}}}}}"#, record(&cache));
        std::fs::write(claude.join("plugins").join("installed_plugins.json"), json).unwrap();
        assert!(uninstall_plugin_in(&claude, "evil@mkt".to_string()).is_err());
        assert!(cache.join("keep.txt").exists());
    }

    #[test]
    fn uninstall_refuses_dotdot_install_path_escaping_cache() {
        let (_d, claude) = uninstall_fixture(r#"{"plugins":{}}"#);
        let sneaky = claude.join("plugins").join("cache").join("..").join("..");
        let json = format!(r#"{{"plugins":{{"evil@mkt":{}}}}}"#, record(&sneaky));
        std::fs::write(claude.join("plugins").join("installed_plugins.json"), json).unwrap();
        assert!(uninstall_plugin_in(&claude, "evil@mkt".to_string()).is_err());
        assert!(claude.join("plugins").join("installed_plugins.json").exists());
    }
}
