use serde::Serialize;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

const SKIP_DIRS: &[&str] = &[".git", "node_modules", "__pycache__"];
const MAX_DEPTH: usize = 8;
const MAX_FILE_SIZE: u64 = 5 * 1024 * 1024; // 5MB

/// Validate that a path is contained within ~/.claude/plugins/.
/// Returns the canonicalized path on success.
fn validate_plugin_path(file_path: &str) -> Result<PathBuf, String> {
    let plugins_dir = dirs::home_dir()
        .ok_or("Could not resolve home directory")?
        .join(".claude")
        .join("plugins");

    // Ensure the plugins directory exists for canonicalization
    if !plugins_dir.exists() {
        return Err("Plugins directory does not exist".to_string());
    }

    let canonical_root = plugins_dir.canonicalize()
        .map_err(|e| format!("Failed to resolve plugins directory: {}", e))?;

    let target = Path::new(file_path);
    let canonical_path = target.canonicalize()
        .map_err(|e| format!("Path not found: {}", e))?;

    if !canonical_path.starts_with(&canonical_root) {
        return Err("Access denied: path outside plugins directory".to_string());
    }

    Ok(canonical_path)
}

/// Validate a path for writing — the file may not exist yet, so we
/// canonicalize the parent directory instead.
fn validate_plugin_write_path(file_path: &str) -> Result<PathBuf, String> {
    let plugins_dir = dirs::home_dir()
        .ok_or("Could not resolve home directory")?
        .join(".claude")
        .join("plugins");

    if !plugins_dir.exists() {
        return Err("Plugins directory does not exist".to_string());
    }

    let canonical_root = plugins_dir.canonicalize()
        .map_err(|e| format!("Failed to resolve plugins directory: {}", e))?;

    let target = Path::new(file_path);
    let parent = target.parent()
        .ok_or("Invalid file path: no parent directory")?;

    let canonical_parent = parent.canonicalize()
        .map_err(|e| format!("Parent directory not found: {}", e))?;

    if !canonical_parent.starts_with(&canonical_root) {
        return Err("Access denied: path outside plugins directory".to_string());
    }

    // Return canonical path to prevent any remaining traversal
    let file_name = target.file_name()
        .ok_or("Invalid file path: no file name")?;
    Ok(canonical_parent.join(file_name))
}

#[derive(Debug, Serialize, Clone)]
pub struct FileTreeNode {
    pub name: String,
    pub path: String,
    pub kind: String, // "file" | "directory"
    pub children: Option<Vec<FileTreeNode>>,
}

fn build_tree(dir: &Path, depth: usize) -> Result<Vec<FileTreeNode>, String> {
    if depth > MAX_DEPTH {
        return Ok(vec![]);
    }

    let entries = fs::read_dir(dir)
        .map_err(|e| format!("Failed to read directory {}: {}", dir.display(), e))?;

    let mut dirs: Vec<FileTreeNode> = Vec::new();
    let mut files: Vec<FileTreeNode> = Vec::new();

    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();

        if SKIP_DIRS.contains(&name.as_str()) {
            continue;
        }

        // Skip symlinks to prevent traversing outside the plugin boundary
        if path.symlink_metadata()
            .map(|m| m.file_type().is_symlink())
            .unwrap_or(false)
        {
            continue;
        }

        if path.is_dir() {
            let children = build_tree(&path, depth + 1)?;
            dirs.push(FileTreeNode {
                name,
                path: path.to_string_lossy().to_string(),
                kind: "directory".to_string(),
                children: Some(children),
            });
        } else {
            files.push(FileTreeNode {
                name,
                path: path.to_string_lossy().to_string(),
                kind: "file".to_string(),
                children: None,
            });
        }
    }

    dirs.sort_by_key(|a| a.name.to_lowercase());
    files.sort_by_key(|a| a.name.to_lowercase());

    dirs.extend(files);
    Ok(dirs)
}

#[tauri::command]
pub fn read_plugin_tree(plugin_path: String) -> Result<FileTreeNode, String> {
    let root = validate_plugin_path(&plugin_path)?;
    if !root.is_dir() {
        return Err(format!("Not a directory: {}", plugin_path));
    }

    let name = root
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| plugin_path.clone());

    let children = build_tree(&root, 0)?;

    Ok(FileTreeNode {
        name,
        path: plugin_path,
        kind: "directory".to_string(),
        children: Some(children),
    })
}

#[tauri::command]
pub fn read_plugin_file(file_path: String) -> Result<String, String> {
    let path = validate_plugin_path(&file_path)?;
    if !path.is_file() {
        return Err(format!("Not a file: {}", file_path));
    }

    let metadata = fs::metadata(&path)
        .map_err(|e| format!("Failed to read metadata: {}", e))?;

    if metadata.len() > MAX_FILE_SIZE {
        return Err(format!(
            "File too large ({:.1}MB, max {}MB)",
            metadata.len() as f64 / 1_048_576.0,
            MAX_FILE_SIZE / 1_048_576
        ));
    }

    // Binary detection: check first 8KB for null bytes
    let mut file = fs::File::open(&path)
        .map_err(|e| format!("Failed to open file: {}", e))?;
    let mut header = vec![0u8; 8192.min(metadata.len() as usize)];
    file.read_exact(&mut header)
        .map_err(|e| format!("Failed to read file header: {}", e))?;

    if header.contains(&0) {
        return Err("Binary file — cannot display".to_string());
    }

    fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read file: {}", e))
}

#[tauri::command]
pub fn write_plugin_file(
    file_path: String,
    content: String,
    expected_sha256: Option<String>,
) -> Result<(), String> {
    let path = validate_plugin_write_path(&file_path)?;

    // AC-50: changed-on-disk check, timestamped backup, atomic replace.
    super::surface_write::write_user_file(&path, &content, expected_sha256.as_deref())
        .map(|_| ())
}

/// Error text from `import_plugin_from_path` / `import_plugin_from_zip` is
/// matched by prefix in apps/desktop/src/pages/harness/plugins/import-errors.ts
/// to reword it for the Plugins page. Changing any of these strings breaks
/// that rewording; `tests::import_error_prefixes_match_import_errors_ts` pins them.
///
/// The webview never names the source. With `source_path` `None` the native
/// folder dialog opens here; with `Some`, the path must be one the user
/// dropped on the window, recorded by `record_dropped_paths` from the native
/// drag-drop event (and spent by this call). Resolves `None` when the user
/// cancels the dialog.
#[tauri::command]
pub async fn import_plugin_from_path(
    app: tauri::AppHandle,
    source_path: Option<String>,
) -> Result<Option<super::plugins::InstalledPlugin>, String> {
    use tauri_plugin_dialog::DialogExt;
    let source = match source_path {
        Some(path) => take_dropped(&path)?,
        None => {
            let Some(picked) = app
                .dialog()
                .file()
                .set_title("Select plugin folder")
                .blocking_pick_folder()
            else {
                return Ok(None);
            };
            picked.into_path().map_err(|e| e.to_string())?
        }
    };
    import_plugin_into(&source.to_string_lossy(), &user_plugins_dir()?).map(Some)
}

fn user_plugins_dir() -> Result<PathBuf, String> {
    Ok(dirs::home_dir()
        .ok_or("Could not resolve home directory")?
        .join(".claude")
        .join("plugins"))
}

/// Paths the user dropped on the window, as reported by the OS to the native
/// layer. The webview hears about a drop too, but only a path recorded here
/// is accepted back from it, so it cannot name a folder or zip of its own.
fn dropped_paths() -> &'static std::sync::Mutex<Vec<PathBuf>> {
    static DROPPED: std::sync::OnceLock<std::sync::Mutex<Vec<PathBuf>>> = std::sync::OnceLock::new();
    DROPPED.get_or_init(|| std::sync::Mutex::new(Vec::new()))
}

/// Keep the most recent drops; a drop that is never imported must not pile up.
const MAX_REMEMBERED_DROPS: usize = 256;

/// Called from the window's native drag-drop event (lib.rs).
pub(crate) fn record_dropped_paths(paths: &[PathBuf]) {
    if let Ok(mut dropped) = dropped_paths().lock() {
        for path in paths {
            if !dropped.contains(path) {
                dropped.push(path.clone());
            }
        }
        let excess = dropped.len().saturating_sub(MAX_REMEMBERED_DROPS);
        dropped.drain(..excess);
    }
}

/// Spend one recorded drop. Refuses a path the OS never reported.
fn take_dropped(path: &str) -> Result<PathBuf, String> {
    let wanted = Path::new(path);
    let mut dropped = dropped_paths()
        .lock()
        .map_err(|_| "Drop registry is unavailable".to_string())?;
    match dropped.iter().position(|p| p == wanted) {
        Some(i) => Ok(dropped.remove(i)),
        None => Err(format!(
            "Refusing to import {path}: it was not dropped on the window or chosen in the dialog"
        )),
    }
}

/// `import_plugin_from_path` with the destination `~/.claude/plugins` passed
/// in, so tests can use a tempdir instead of mutating the process-global HOME.
fn import_plugin_into(source_path: &str, plugins_dir: &Path) -> Result<super::plugins::InstalledPlugin, String> {
    let source = Path::new(source_path);
    if !source.is_dir() {
        return Err(format!("Not a directory: {}", source_path));
    }

    // Validate plugin manifest exists
    let manifest_path = source.join(".claude-plugin").join("plugin.json");
    if !manifest_path.exists() {
        return Err("Invalid plugin: missing .claude-plugin/plugin.json".to_string());
    }

    let manifest_contents = fs::read_to_string(&manifest_path)
        .map_err(|e| format!("Failed to read plugin manifest: {}", e))?;

    #[derive(serde::Deserialize)]
    struct Manifest {
        name: String,
        version: String,
        description: Option<String>,
        category: Option<String>,
        tags: Option<Vec<String>>,
    }

    let manifest: Manifest = serde_json::from_str(&manifest_contents)
        .map_err(|e| format!("Failed to parse plugin manifest: {}", e))?;

    // Validate manifest.name to prevent path traversal
    if manifest.name.is_empty()
        || manifest.name.contains('/')
        || manifest.name.contains('\\')
        || manifest.name.contains("..")
    {
        return Err("Invalid plugin name: must be a simple directory name".to_string());
    }

    let dest = plugins_dir.join(&manifest.name);

    // Prevent silently overwriting an existing plugin
    if dest.exists() {
        return Err(format!(
            "Plugin '{}' is already installed. Uninstall it first before reimporting.",
            manifest.name
        ));
    }

    // Copy directory recursively
    copy_dir_recursive(source, &dest)?;

    // Update installed_plugins.json
    update_installed_plugins_json(plugins_dir, &manifest.name, &manifest.version, dest.to_string_lossy().as_ref())?;

    Ok(super::plugins::InstalledPlugin {
        name: manifest.name,
        version: manifest.version,
        description: manifest.description,
        marketplace: None,
        source: Some(dest.to_string_lossy().to_string()),
        installed_at: Some(chrono::Utc::now().to_rfc3339()),
        category: manifest.category,
        tags: manifest.tags,
        component_counts: None,
    })
}

/// Copy at most `max` bytes. Reads one byte past the cap through `take()` so
/// an entry that decompresses larger than `max` is refused
/// (`ErrorKind::FileTooLarge`) instead of filling the disk.
fn copy_capped(
    reader: &mut impl std::io::Read,
    writer: &mut impl std::io::Write,
    max: u64,
) -> std::io::Result<Option<u64>> {
    use std::io::Read;
    let copied = std::io::copy(&mut reader.take(max.saturating_add(1)), writer)?;
    Ok(if copied > max { None } else { Some(copied) })
}

/// Same source rule as `import_plugin_from_path`: the zip is chosen in a
/// native dialog opened here (`None`), or is a path the user dropped on the
/// window (`Some`).
#[tauri::command]
pub async fn import_plugin_from_zip(
    app: tauri::AppHandle,
    zip_path: Option<String>,
) -> Result<Option<super::plugins::InstalledPlugin>, String> {
    use tauri_plugin_dialog::DialogExt;
    let zip = match zip_path {
        Some(path) => take_dropped(&path)?,
        None => {
            let Some(picked) = app
                .dialog()
                .file()
                .set_title("Select plugin zip")
                .add_filter("Plugin zip", &["zip"])
                .blocking_pick_file()
            else {
                return Ok(None);
            };
            picked.into_path().map_err(|e| e.to_string())?
        }
    };
    import_zip_at(&zip.to_string_lossy()).map(Some)
}

fn import_zip_at(zip_path: &str) -> Result<super::plugins::InstalledPlugin, String> {
    let zip_file = fs::File::open(zip_path)
        .map_err(|e| format!("Failed to open zip: {}", e))?;

    let mut archive = zip::ZipArchive::new(zip_file)
        .map_err(|e| format!("Failed to read zip archive: {}", e))?;

    // Extract to temp dir first
    let temp_dir = std::env::temp_dir().join(format!("harness-kit-import-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&temp_dir)
        .map_err(|e| format!("Failed to create temp directory: {}", e))?;

    const MAX_EXTRACTED_BYTES: u64 = 100 * 1024 * 1024; // 100MB
    const MAX_ENTRIES: usize = 10_000;
    const MAX_ENTRY_BYTES: u64 = 50 * 1024 * 1024; // 50MB per entry

    if archive.len() > MAX_ENTRIES {
        let _ = fs::remove_dir_all(&temp_dir);
        return Err(format!("Zip archive has too many entries ({})", archive.len()));
    }

    let mut total_extracted: u64 = 0;

    for i in 0..archive.len() {
        let mut file = archive.by_index(i)
            .map_err(|e| format!("Failed to read zip entry: {}", e))?;

        let entry_name = file.name()
            .map_err(|e| format!("Failed to read zip entry name: {}", e))?
            .into_owned();
        let out_path = temp_dir.join(
            file.mangled_name()
                .map_err(|e| format!("Failed to read zip entry name: {}", e))?,
        );

        // Zip Slip protection: ensure extracted path stays within temp_dir
        if !out_path.starts_with(&temp_dir) {
            let _ = fs::remove_dir_all(&temp_dir);
            return Err(format!("Zip entry escapes extraction directory: {}", entry_name));
        }

        if entry_name.ends_with('/') {
            fs::create_dir_all(&out_path)
                .map_err(|e| format!("Failed to create directory: {}", e))?;
        } else {
            if let Some(parent) = out_path.parent() {
                fs::create_dir_all(parent)
                    .map_err(|e| format!("Failed to create parent directory: {}", e))?;
            }
            let mut outfile = fs::File::create(&out_path)
                .map_err(|e| format!("Failed to create file: {}", e))?;
            // The central directory's declared size is attacker-controlled, so
            // the cap is on bytes actually read, not on the header.
            let cap = MAX_ENTRY_BYTES.min(MAX_EXTRACTED_BYTES - total_extracted);
            let bytes_written = match copy_capped(&mut file, &mut outfile, cap) {
                Ok(Some(n)) => n,
                Ok(None) => {
                    let _ = fs::remove_dir_all(&temp_dir);
                    return Err(format!("Zip entry too large when extracted: {}", entry_name));
                }
                Err(e) => {
                    let _ = fs::remove_dir_all(&temp_dir);
                    return Err(format!("Failed to extract file: {}", e));
                }
            };
            total_extracted += bytes_written;
            if total_extracted > MAX_EXTRACTED_BYTES {
                let _ = fs::remove_dir_all(&temp_dir);
                return Err("Zip archive too large when extracted (>100MB limit)".to_string());
            }
        }
    }

    // Find the plugin root (may be nested one level)
    let plugin_root = find_plugin_root(&temp_dir)?;

    // Use the folder import from here
    let result = user_plugins_dir()
        .and_then(|dir| import_plugin_into(&plugin_root.to_string_lossy(), &dir));

    // Clean up temp
    let _ = fs::remove_dir_all(&temp_dir);

    result
}

/// Export a plugin as a zip. The destination comes from a native save dialog
/// opened here, never from the webview, so the webview cannot choose an
/// arbitrary path to overwrite. Resolves `false` when the user cancels.
#[tauri::command]
pub async fn export_plugin_as_zip(
    app: tauri::AppHandle,
    plugin_path: String,
) -> Result<bool, String> {
    use tauri_plugin_dialog::DialogExt;
    let validated = validate_plugin_path(&plugin_path)?;
    let default_name = format!(
        "{}.zip",
        validated
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| "plugin".to_string())
    );
    let Some(picked) = app
        .dialog()
        .file()
        .set_title("Export plugin as zip")
        .set_file_name(default_name)
        .blocking_save_file()
    else {
        return Ok(false);
    };
    let save_path = picked.into_path().map_err(|e| e.to_string())?;
    write_plugin_zip(&validated, &save_path)?;
    Ok(true)
}

fn write_plugin_zip(source: &Path, save_path: &Path) -> Result<(), String> {
    if !source.is_dir() {
        return Err(format!("Not a directory: {}", source.display()));
    }

    let file = fs::File::create(save_path)
        .map_err(|e| format!("Failed to create zip file: {}", e))?;
    let mut zip_writer = zip::ZipWriter::new(file);

    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    for entry in WalkDir::new(source).into_iter().filter_entry(|e| {
        let name = e.file_name().to_string_lossy();
        !SKIP_DIRS.contains(&name.as_ref())
    }) {
        let entry = entry.map_err(|e| format!("Walk error: {}", e))?;
        let path = entry.path();
        let relative = path
            .strip_prefix(source)
            .map_err(|e| format!("Strip prefix error: {}", e))?;

        if relative.as_os_str().is_empty() {
            continue;
        }

        let rel_str = relative.to_string_lossy().to_string();

        if path.is_dir() {
            zip_writer
                .add_directory(format!("{}/", rel_str), options)
                .map_err(|e| format!("Failed to add directory to zip: {}", e))?;
        } else {
            zip_writer
                .start_file(&rel_str, options)
                .map_err(|e| format!("Failed to start zip file entry: {}", e))?;
            let mut f = fs::File::open(path)
                .map_err(|e| format!("Failed to open file for zip: {}", e))?;
            std::io::copy(&mut f, &mut zip_writer)
                .map_err(|e| format!("Failed to write to zip: {}", e))?;
        }
    }

    zip_writer
        .finish()
        .map_err(|e| format!("Failed to finalize zip: {}", e))?;

    Ok(())
}

/// Export a plugin into a folder chosen in a native folder dialog opened
/// here, never named by the webview. Resolves `false` when the user cancels.
#[tauri::command]
pub async fn export_plugin_to_folder(
    app: tauri::AppHandle,
    plugin_path: String,
) -> Result<bool, String> {
    use tauri_plugin_dialog::DialogExt;
    let validated = validate_plugin_path(&plugin_path)?;
    let Some(picked) = app
        .dialog()
        .file()
        .set_title("Export plugin to folder")
        .blocking_pick_folder()
    else {
        return Ok(false);
    };
    let dest = picked.into_path().map_err(|e| e.to_string())?;
    copy_plugin_to_folder(&validated, &dest)?;
    Ok(true)
}

fn copy_plugin_to_folder(source: &Path, dest: &Path) -> Result<(), String> {
    if !source.is_dir() {
        return Err(format!("Not a directory: {}", source.display()));
    }

    // Create a named subdirectory to avoid merging into an existing folder
    let dir_name = source.file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "plugin".to_string());
    let destination = dest.join(dir_name);

    if destination.exists() {
        return Err(format!("Destination already exists: {}", destination.display()));
    }

    copy_dir_recursive(source, &destination)
}

// ── Helpers ─────────────────────────────────────────────────

fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), String> {
    fs::create_dir_all(dst)
        .map_err(|e| format!("Failed to create directory {}: {}", dst.display(), e))?;

    for entry in WalkDir::new(src).into_iter().filter_entry(|e| {
        let name = e.file_name().to_string_lossy();
        !SKIP_DIRS.contains(&name.as_ref())
    }) {
        let entry = entry.map_err(|e| format!("Walk error: {}", e))?;
        let path = entry.path();

        // Skip symlinks to prevent pulling external content into the plugin directory
        if entry.path_is_symlink() {
            continue;
        }

        let relative = path
            .strip_prefix(src)
            .map_err(|e| format!("Strip prefix error: {}", e))?;
        let dest_path = dst.join(relative);

        if path.is_dir() {
            fs::create_dir_all(&dest_path)
                .map_err(|e| format!("Failed to create dir: {}", e))?;
        } else {
            fs::copy(path, &dest_path)
                .map_err(|e| format!("Failed to copy file: {}", e))?;
        }
    }

    Ok(())
}

fn find_plugin_root(dir: &Path) -> Result<std::path::PathBuf, String> {
    // Check if this directory itself is a plugin
    if dir.join(".claude-plugin").join("plugin.json").exists() {
        return Ok(dir.to_path_buf());
    }

    // Check one level down
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() && path.join(".claude-plugin").join("plugin.json").exists() {
                return Ok(path);
            }
        }
    }

    Err("Could not find .claude-plugin/plugin.json in extracted archive".to_string())
}

fn update_installed_plugins_json(plugins_dir: &Path, name: &str, version: &str, install_path: &str) -> Result<(), String> {
    let path = plugins_dir.join("installed_plugins.json");

    let mut data: serde_json::Value = if path.exists() {
        let contents = fs::read_to_string(&path)
            .map_err(|e| format!("Failed to read installed_plugins.json: {}", e))?;
        serde_json::from_str(&contents)
            .map_err(|e| format!("Failed to parse installed_plugins.json: {}", e))?
    } else {
        serde_json::json!({ "plugins": {} })
    };

    let plugins = data
        .get_mut("plugins")
        .and_then(|p| p.as_object_mut())
        .ok_or("Invalid installed_plugins.json structure")?;

    let now = chrono::Utc::now().to_rfc3339();
    plugins.insert(
        name.to_string(),
        serde_json::json!([{
            "version": version,
            "installedAt": now,
            "installPath": install_path,
        }]),
    );

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create plugins directory: {}", e))?;
    }

    let serialized = serde_json::to_string_pretty(&data)
        .map_err(|e| format!("Failed to serialize plugins data: {}", e))?;
    let tmp_path = path.with_extension("json.tmp");
    fs::write(&tmp_path, &serialized)
        .map_err(|e| format!("Failed to write installed_plugins.json: {}", e))?;
    fs::rename(&tmp_path, &path)
        .map_err(|e| format!("Failed to finalize installed_plugins.json: {}", e))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn write_manifest(dir: &Path, json: &str) {
        fs::create_dir_all(dir.join(".claude-plugin")).unwrap();
        fs::write(dir.join(".claude-plugin").join("plugin.json"), json).unwrap();
    }

    #[test]
    fn copy_capped_refuses_an_entry_over_the_limit() {
        let data = vec![7u8; 11];
        let mut out = Vec::new();
        assert_eq!(copy_capped(&mut data.as_slice(), &mut out, 10).unwrap(), None);
        // Never wrote more than limit + 1 bytes of an unbounded stream.
        assert!(out.len() <= 11);
    }

    #[test]
    fn copy_capped_stops_reading_an_endless_stream() {
        let mut endless = std::io::repeat(0u8);
        let mut out = Vec::new();
        assert_eq!(copy_capped(&mut endless, &mut out, 1024).unwrap(), None);
        assert_eq!(out.len(), 1025);
    }

    #[test]
    fn copy_capped_accepts_an_entry_at_the_limit() {
        let data = vec![7u8; 10];
        let mut out = Vec::new();
        assert_eq!(copy_capped(&mut data.as_slice(), &mut out, 10).unwrap(), Some(10));
        assert_eq!(out, data);
    }

    /// apps/desktop/src/pages/harness/plugins/import-errors.ts matches these
    /// prefixes to reword import failures. If one changes here, update the
    /// matching regex there (and this test) in the same commit.
    #[test]
    fn import_error_prefixes_match_import_errors_ts() {
        let tmp = TempDir::new().unwrap();
        let plugins_dir = tmp.path().join("plugins");
        let err = |p: &Path| import_plugin_into(p.to_str().unwrap(), &plugins_dir).unwrap_err();

        // /^Not a directory/
        let file = tmp.path().join("notes.md");
        fs::write(&file, "x").unwrap();
        assert!(err(&file).starts_with("Not a directory: "), "{}", err(&file));

        // /missing \.claude-plugin\/plugin\.json/
        let empty = tmp.path().join("empty");
        fs::create_dir_all(&empty).unwrap();
        assert_eq!(err(&empty), "Invalid plugin: missing .claude-plugin/plugin.json");

        // /^Failed to read plugin manifest/ (plugin.json is a directory: exists, unreadable as a file)
        let unreadable = tmp.path().join("unreadable");
        fs::create_dir_all(unreadable.join(".claude-plugin").join("plugin.json")).unwrap();
        assert!(err(&unreadable).starts_with("Failed to read plugin manifest: "), "{}", err(&unreadable));

        // /^Failed to parse plugin manifest/
        let bad_json = tmp.path().join("bad-json");
        write_manifest(&bad_json, "{ not json");
        assert!(err(&bad_json).starts_with("Failed to parse plugin manifest: "), "{}", err(&bad_json));

        // /^Invalid plugin name/
        let bad_name = tmp.path().join("bad-name");
        write_manifest(&bad_name, r#"{"name":"../escape","version":"1.0.0"}"#);
        assert_eq!(err(&bad_name), "Invalid plugin name: must be a simple directory name");

        // /Plugin '([^']+)' is already installed/
        let good = tmp.path().join("research");
        write_manifest(&good, r#"{"name":"research","version":"1.0.0"}"#);
        import_plugin_into(good.to_str().unwrap(), &plugins_dir).unwrap();
        assert_eq!(
            err(&good),
            "Plugin 'research' is already installed. Uninstall it first before reimporting."
        );

        // /^Could not find \.claude-plugin\/plugin\.json in extracted archive/
        let extracted = tmp.path().join("extracted");
        fs::create_dir_all(&extracted).unwrap();
        assert_eq!(
            find_plugin_root(&extracted).unwrap_err(),
            "Could not find .claude-plugin/plugin.json in extracted archive"
        );

        // /^Failed to (open|read) zip/
        let missing_zip = tmp.path().join("missing.zip");
        assert!(import_zip_at(&missing_zip.to_string_lossy())
            .unwrap_err()
            .starts_with("Failed to open zip: "));
        let not_zip = tmp.path().join("not.zip");
        fs::write(&not_zip, "not a zip").unwrap();
        assert!(import_zip_at(&not_zip.to_string_lossy())
            .unwrap_err()
            .starts_with("Failed to read zip archive: "));
    }

    #[test]
    fn only_a_path_the_os_dropped_can_be_imported_and_only_once() {
        let tmp = TempDir::new().unwrap();
        let dropped = tmp.path().join("dropped-plugin");
        let invented = tmp.path().join("webview-invented");
        record_dropped_paths(&[dropped.clone()]);

        let err = take_dropped(&invented.to_string_lossy()).unwrap_err();
        assert!(err.starts_with("Refusing to import"), "{err}");
        assert_eq!(take_dropped(&dropped.to_string_lossy()).unwrap(), dropped);
        assert!(
            take_dropped(&dropped.to_string_lossy()).is_err(),
            "a drop is spent by the import it authorises"
        );
    }

    #[test]
    fn remembered_drops_are_capped() {
        let tmp = TempDir::new().unwrap();
        let first = tmp.path().join("first");
        record_dropped_paths(&[first.clone()]);
        let flood: Vec<PathBuf> = (0..MAX_REMEMBERED_DROPS + 5)
            .map(|i| tmp.path().join(format!("flood-{i}")))
            .collect();
        record_dropped_paths(&flood);
        assert!(take_dropped(&first.to_string_lossy()).is_err());
        let last = flood.last().unwrap();
        assert_eq!(&take_dropped(&last.to_string_lossy()).unwrap(), last);
    }

    #[test]
    fn export_helpers_write_zip_and_folder_copy() {
        let tmp = TempDir::new().unwrap();
        let src = tmp.path().join("demo");
        write_manifest(&src, r#"{"name":"demo","version":"1.0.0"}"#);

        let zip_path = tmp.path().join("out.zip");
        write_plugin_zip(&src, &zip_path).unwrap();
        assert!(zip_path.metadata().unwrap().len() > 0);

        let dest = tmp.path().join("dest");
        fs::create_dir_all(&dest).unwrap();
        copy_plugin_to_folder(&src, &dest).unwrap();
        assert!(dest.join("demo/.claude-plugin/plugin.json").is_file());
        // A second export never merges into the existing folder.
        assert!(copy_plugin_to_folder(&src, &dest).unwrap_err().starts_with("Destination already exists"));
    }

    #[test]
    fn import_plugin_from_zip_keeps_entries_inside_the_extraction_dir() {
        use std::io::Write;

        let tmp = TempDir::new().unwrap();
        let probe = format!("zip-slip-probe-{}.txt", uuid::Uuid::new_v4());
        let escaped = std::env::temp_dir().join(&probe);
        let zip_path = tmp.path().join("hostile.zip");
        {
            let mut writer = zip::ZipWriter::new(fs::File::create(&zip_path).unwrap());
            let options = zip::write::SimpleFileOptions::default();
            writer.start_file(format!("../{}", probe), options).unwrap();
            writer.write_all(b"escaped").unwrap();
            writer.start_file("pkg/readme.txt", options).unwrap();
            writer.write_all(b"inside").unwrap();
            writer.finish().unwrap();
        }

        let leftovers = |dir: &Path| -> Vec<std::path::PathBuf> {
            fs::read_dir(dir).unwrap()
                .filter_map(|e| e.ok().map(|e| e.path()))
                .filter(|p| p.file_name().map_or(false, |n| n.to_string_lossy().starts_with("harness-kit-import-")))
                .collect()
        };
        let before = leftovers(&std::env::temp_dir());

        let err = import_zip_at(&zip_path.to_string_lossy()).unwrap_err();
        assert_eq!(err, "Could not find .claude-plugin/plugin.json in extracted archive");
        assert!(!escaped.exists(), "zip entry escaped the extraction directory");

        // The extraction directory is left behind on this error path; remove what this run created.
        for dir in leftovers(&std::env::temp_dir()).into_iter().filter(|p| !before.contains(p)) {
            let _ = fs::remove_dir_all(dir);
        }
    }

    #[test]
    fn import_plugin_into_copies_and_records_the_plugin() {
        let tmp = TempDir::new().unwrap();
        let plugins_dir = tmp.path().join("plugins");
        let src = tmp.path().join("research");
        write_manifest(&src, r#"{"name":"research","version":"1.2.3"}"#);

        let installed = import_plugin_into(src.to_str().unwrap(), &plugins_dir).unwrap();
        assert_eq!(installed.name, "research");
        assert!(plugins_dir.join("research/.claude-plugin/plugin.json").exists());
        let record = fs::read_to_string(plugins_dir.join("installed_plugins.json")).unwrap();
        assert!(record.contains("\"research\""), "{}", record);
        assert!(record.contains("1.2.3"), "{}", record);
    }
}
