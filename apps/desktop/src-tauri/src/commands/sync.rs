use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

// ── Path helpers ───────────────────────────────────────────────

/// Expand a leading `~/` to the user's home directory.
/// Rust's std::path does not expand tildes, so manual text input like
/// `~/repos/foo` would otherwise fail silently.
fn expand_tilde(path: &str) -> String {
    if let Some(rest) = path.strip_prefix("~/") {
        if let Some(home) = dirs::home_dir() {
            return home.join(rest).to_string_lossy().into_owned();
        }
    }
    path.to_string()
}

// ── Path validation ───────────────────────────────────────────

/// Validate that `relative` is safely within `project_dir`.
/// Rejects absolute paths and ".." components in `relative`.
fn validate_project_path(project_dir: &str, relative: &str) -> Result<PathBuf, String> {
    if Path::new(relative).is_absolute() {
        return Err("relative path must not be absolute".to_string());
    }
    if relative.contains("..") {
        return Err("relative path must not contain '..'".to_string());
    }

    let project = Path::new(project_dir);
    if !project.exists() {
        return Err(format!("Project directory does not exist: {}", project_dir));
    }

    let canonical_root = project
        .canonicalize()
        .map_err(|e| format!("Failed to resolve project directory: {}", e))?;

    let full_path = canonical_root.join(relative);

    if full_path.exists() {
        let canonical_path = full_path
            .canonicalize()
            .map_err(|e| format!("Failed to resolve path: {}", e))?;
        if !canonical_path.starts_with(&canonical_root) {
            return Err("Access denied: path outside project directory".to_string());
        }
        return Ok(canonical_path);
    }

    // For non-existent targets, canonicalize the nearest existing ancestor
    // and verify it's within the project root.
    let mut ancestor = full_path.clone();
    while let Some(parent) = ancestor.parent() {
        if parent.exists() {
            let canonical_parent = parent
                .canonicalize()
                .map_err(|e| format!("Failed to resolve ancestor directory: {}", e))?;
            if !canonical_parent.starts_with(&canonical_root) {
                return Err("Access denied: path outside project directory".to_string());
            }
            // Reconstruct full path from canonical ancestor + remaining suffix
            let suffix = full_path.strip_prefix(parent).unwrap_or(&full_path);
            return Ok(canonical_parent.join(suffix));
        }
        ancestor = parent.to_path_buf();
    }

    Err("Access denied: could not resolve path".to_string())
}

// ── Structs ───────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncFileWrite {
    pub relative_path: String,
    pub content: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BackupFileEntry {
    pub relative_path: String,
    pub existed: bool,
    pub size_bytes: u64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupManifest {
    pub id: String,
    pub timestamp: String,
    pub project_dir: String,
    pub harness_name: String,
    pub platforms: Vec<String>,
    pub files: Vec<BackupFileEntry>,
}

// ── Commands ──────────────────────────────────────────────────

/// Read a file from a project directory.
#[tauri::command]
pub fn sync_read_file(project_dir: String, file_path: String) -> Result<String, String> {
    let project_dir = expand_tilde(&project_dir);
    let canonical = validate_project_path(&project_dir, &file_path)?;
    fs::read_to_string(&canonical)
        .map_err(|e| format!("Failed to read {}: {}", file_path, e))
}

/// Check if a path exists within a project directory.
/// Pass "." to check if the project directory itself exists.
#[tauri::command]
pub fn sync_file_exists(project_dir: String, file_path: String) -> Result<bool, String> {
    let project_dir = expand_tilde(&project_dir);
    if file_path == "." {
        return Ok(Path::new(&project_dir).exists());
    }
    if Path::new(&file_path).is_absolute() || file_path.contains("..") {
        return Err("Invalid file path".to_string());
    }
    let full = Path::new(&project_dir).join(&file_path);
    Ok(full.exists())
}

/// List file names in a directory within a project directory.
#[tauri::command]
pub fn sync_read_dir(project_dir: String, dir_path: String) -> Result<Vec<String>, String> {
    let project_dir = expand_tilde(&project_dir);
    let canonical = validate_project_path(&project_dir, &dir_path)?;
    let entries = fs::read_dir(&canonical)
        .map_err(|e| format!("Failed to read directory {}: {}", dir_path, e))?;
    let mut names = Vec::new();
    for entry in entries.flatten() {
        if let Some(name) = entry.file_name().to_str() {
            names.push(name.to_string());
        }
    }
    Ok(names)
}

/// Write compiled output files into a project directory.
#[tauri::command]
pub fn sync_write_files(project_dir: String, files: Vec<SyncFileWrite>) -> Result<(), String> {
    let project_dir = expand_tilde(&project_dir);
    for file in &files {
        let dest = validate_project_path(&project_dir, &file.relative_path)?;
        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent).map_err(|e| {
                format!("Failed to create directory for {}: {}", file.relative_path, e)
            })?;
        }
        fs::write(&dest, &file.content)
            .map_err(|e| format!("Failed to write {}: {}", file.relative_path, e))?;
    }
    Ok(())
}

/// Create a backup of specified project files under ~/.harness-kit/backups/{uuid}/.
#[tauri::command]
pub fn sync_create_backup(
    project_dir: String,
    harness_name: String,
    platforms: Vec<String>,
    file_paths: Vec<String>,
) -> Result<BackupManifest, String> {
    let project_dir = expand_tilde(&project_dir);
    let backup_id = uuid::Uuid::new_v4().to_string();
    let timestamp = chrono::Utc::now().to_rfc3339();

    let backup_root = dirs::home_dir()
        .ok_or("Could not resolve home directory")?
        .join(".harness-kit")
        .join("backups")
        .join(&backup_id);

    let files_dir = backup_root.join("files");
    fs::create_dir_all(&files_dir)
        .map_err(|e| format!("Failed to create backup directory: {}", e))?;

    let mut file_entries: Vec<BackupFileEntry> = Vec::new();

    for rel_path in &file_paths {
        match validate_project_path(&project_dir, rel_path) {
            Ok(src) if src.exists() => {
                let size_bytes = src.metadata().map(|m| m.len()).unwrap_or(0);

                // Mirror directory structure inside the backup
                let dest_rel = rel_path.replace('/', std::path::MAIN_SEPARATOR_STR);
                let dest = files_dir.join(&dest_rel);
                if let Some(parent) = dest.parent() {
                    fs::create_dir_all(parent)
                        .map_err(|e| format!("Failed to create backup subdir: {}", e))?;
                }
                fs::copy(&src, &dest)
                    .map_err(|e| format!("Failed to backup {}: {}", rel_path, e))?;

                file_entries.push(BackupFileEntry {
                    relative_path: rel_path.clone(),
                    existed: true,
                    size_bytes,
                });
            }
            _ => {
                file_entries.push(BackupFileEntry {
                    relative_path: rel_path.clone(),
                    existed: false,
                    size_bytes: 0,
                });
            }
        }
    }

    let manifest = BackupManifest {
        id: backup_id.clone(),
        timestamp,
        project_dir,
        harness_name,
        platforms,
        files: file_entries,
    };

    let manifest_json = serde_json::to_string_pretty(&manifest)
        .map_err(|e| format!("Failed to serialize manifest: {}", e))?;

    fs::write(backup_root.join("manifest.json"), &manifest_json)
        .map_err(|e| format!("Failed to write backup manifest: {}", e))?;

    Ok(manifest)
}

/// List all backups from ~/.harness-kit/backups/, newest first.
#[tauri::command]
pub fn sync_list_backups() -> Result<Vec<BackupManifest>, String> {
    let backups_root = dirs::home_dir()
        .ok_or("Could not resolve home directory")?
        .join(".harness-kit")
        .join("backups");

    if !backups_root.exists() {
        return Ok(vec![]);
    }

    let mut manifests: Vec<BackupManifest> = Vec::new();

    for entry in fs::read_dir(&backups_root)
        .map_err(|e| format!("Failed to read backups directory: {}", e))?
        .flatten()
    {
        let manifest_path = entry.path().join("manifest.json");
        if !manifest_path.exists() {
            continue;
        }
        let Ok(content) = fs::read_to_string(&manifest_path) else {
            continue;
        };
        if let Ok(manifest) = serde_json::from_str::<BackupManifest>(&content) {
            manifests.push(manifest);
        }
    }

    // Newest first
    manifests.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    Ok(manifests)
}

/// Restore files from a backup back to their original project locations.
/// Creates a safety backup of the current state first.
#[tauri::command]
pub fn sync_restore_backup(backup_id: String) -> Result<(), String> {
    let backup_root = dirs::home_dir()
        .ok_or("Could not resolve home directory")?
        .join(".harness-kit")
        .join("backups")
        .join(&backup_id);

    if !backup_root.exists() {
        return Err(format!("Backup {} not found", backup_id));
    }

    let manifest_content = fs::read_to_string(backup_root.join("manifest.json"))
        .map_err(|e| format!("Failed to read backup manifest: {}", e))?;
    let manifest: BackupManifest = serde_json::from_str(&manifest_content)
        .map_err(|e| format!("Failed to parse backup manifest: {}", e))?;

    // Safety backup of current state
    let current_paths: Vec<String> = manifest.files.iter().map(|f| f.relative_path.clone()).collect();
    sync_create_backup(
        manifest.project_dir.clone(),
        format!("pre-restore-{}", &backup_id[..8]),
        manifest.platforms.clone(),
        current_paths,
    )?;

    // Restore
    let files_dir = backup_root.join("files");
    for file_entry in &manifest.files {
        if !file_entry.existed {
            continue;
        }
        let src = files_dir.join(file_entry.relative_path.replace('/', std::path::MAIN_SEPARATOR_STR));
        if !src.exists() {
            continue;
        }
        let dest = validate_project_path(&manifest.project_dir, &file_entry.relative_path)?;
        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create directory for restore: {}", e))?;
        }
        fs::copy(&src, &dest)
            .map_err(|e| format!("Failed to restore {}: {}", file_entry.relative_path, e))?;
    }

    Ok(())
}
