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

    dirs.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    files.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

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
pub fn write_plugin_file(file_path: String, content: String) -> Result<(), String> {
    let path = validate_plugin_write_path(&file_path)?;

    fs::write(path, content)
        .map_err(|e| format!("Failed to write file: {}", e))
}

#[tauri::command]
pub fn import_plugin_from_path(source_path: String) -> Result<super::plugins::InstalledPlugin, String> {
    let source = Path::new(&source_path);
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

    let plugins_dir = dirs::home_dir()
        .ok_or("Could not resolve home directory")?
        .join(".claude")
        .join("plugins");

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
    update_installed_plugins_json(&manifest.name, &manifest.version, dest.to_string_lossy().as_ref())?;

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

#[tauri::command]
pub fn import_plugin_from_zip(zip_path: String) -> Result<super::plugins::InstalledPlugin, String> {
    let zip_file = fs::File::open(&zip_path)
        .map_err(|e| format!("Failed to open zip: {}", e))?;

    let mut archive = zip::ZipArchive::new(zip_file)
        .map_err(|e| format!("Failed to read zip archive: {}", e))?;

    // Extract to temp dir first
    let temp_dir = std::env::temp_dir().join(format!("harness-kit-import-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&temp_dir)
        .map_err(|e| format!("Failed to create temp directory: {}", e))?;

    const MAX_EXTRACTED_BYTES: u64 = 100 * 1024 * 1024; // 100MB
    const MAX_ENTRIES: usize = 10_000;

    if archive.len() > MAX_ENTRIES {
        let _ = fs::remove_dir_all(&temp_dir);
        return Err(format!("Zip archive has too many entries ({})", archive.len()));
    }

    let mut total_extracted: u64 = 0;

    for i in 0..archive.len() {
        let mut file = archive.by_index(i)
            .map_err(|e| format!("Failed to read zip entry: {}", e))?;

        let out_path = temp_dir.join(file.mangled_name());

        // Zip Slip protection: ensure extracted path stays within temp_dir
        if !out_path.starts_with(&temp_dir) {
            let _ = fs::remove_dir_all(&temp_dir);
            return Err(format!("Zip entry escapes extraction directory: {}", file.name()));
        }

        if file.name().ends_with('/') {
            fs::create_dir_all(&out_path)
                .map_err(|e| format!("Failed to create directory: {}", e))?;
        } else {
            if let Some(parent) = out_path.parent() {
                fs::create_dir_all(parent)
                    .map_err(|e| format!("Failed to create parent directory: {}", e))?;
            }
            let mut outfile = fs::File::create(&out_path)
                .map_err(|e| format!("Failed to create file: {}", e))?;
            let bytes_written = std::io::copy(&mut file, &mut outfile)
                .map_err(|e| format!("Failed to extract file: {}", e))?;
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
    let result = import_plugin_from_path(plugin_root.to_string_lossy().to_string());

    // Clean up temp
    let _ = fs::remove_dir_all(&temp_dir);

    result
}

#[tauri::command]
pub fn export_plugin_as_zip(plugin_path: String, save_path: String) -> Result<(), String> {
    // Validate plugin_path is within the plugins directory
    let validated = validate_plugin_path(&plugin_path)?;
    let source = validated.as_path();
    if !source.is_dir() {
        return Err(format!("Not a directory: {}", plugin_path));
    }

    let file = fs::File::create(&save_path)
        .map_err(|e| format!("Failed to create zip file: {}", e))?;
    let mut zip_writer = zip::ZipWriter::new(file);

    let options = zip::write::FileOptions::default()
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

#[tauri::command]
pub fn export_plugin_to_folder(plugin_path: String, dest: String) -> Result<(), String> {
    // Validate plugin_path is within the plugins directory
    let validated = validate_plugin_path(&plugin_path)?;
    let source = validated.as_path();
    if !source.is_dir() {
        return Err(format!("Not a directory: {}", plugin_path));
    }

    // Create a named subdirectory to avoid merging into an existing folder
    let dir_name = source.file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "plugin".to_string());
    let destination = Path::new(&dest).join(dir_name);

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

fn update_installed_plugins_json(name: &str, version: &str, install_path: &str) -> Result<(), String> {
    let path = dirs::home_dir()
        .ok_or("Could not resolve home directory")?
        .join(".claude")
        .join("plugins")
        .join("installed_plugins.json");

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
