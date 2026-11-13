use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

use super::fs_scope::{is_granted_root, is_home_or_ancestor};

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

/// Resolve a caller-supplied project directory to a canonical root.
///
/// These commands are reachable from any webview JS and write through
/// `std::fs`, which bypasses the Tauri FS plugin scope entirely — so the
/// home-directory refusal in `fs_scope::grant_project_scope` does *not*
/// protect them. Without this guard a caller could pass `~/` (or any absolute
/// path) as the "project" and use the relative-path writer to reach
/// `~/.zshrc`, `~/.ssh/`, or a git hooks directory: path traversal is
/// correctly blocked, but the root itself was never constrained.
///
/// Two rules, because one is not enough. Rejecting only home and its
/// ancestors still left every home *subdirectory* usable as a "project" —
/// `~/.ssh`, `~/Library/LaunchAgents`, `~/.claude` — which made this an
/// unguarded door beside the registry-allowlisted one. The root must also be
/// one the user actually picked through the folder dialog
/// (`grant_project_scope`), which is the only thing that makes it a project.
fn resolve_project_root(project_dir: &str) -> Result<PathBuf, String> {
    let expanded = expand_tilde(project_dir);
    let project = Path::new(&expanded);
    if !project.exists() {
        return Err(format!("Project directory does not exist: {}", expanded));
    }

    let canonical_root = project
        .canonicalize()
        .map_err(|e| format!("Failed to resolve project directory: {}", e))?;

    if let Some(home) = dirs::home_dir() {
        let canonical_home = home.canonicalize().unwrap_or(home);
        if is_home_or_ancestor(&canonical_root, &canonical_home) {
            return Err(
                "Refusing to operate on the home directory or one of its ancestors".to_string(),
            );
        }
        // Inside home, only a granted root counts. Outside home, the dialog
        // grant is still the thing that makes a directory a project, so the
        // rule is uniform.
        if !is_granted_root(&canonical_root) {
            return Err(format!(
                "Refusing to operate on '{}': not a project directory granted this session",
                canonical_root.display()
            ));
        }
    }

    Ok(canonical_root)
}

fn validate_relative(relative: &str) -> Result<(), String> {
    if Path::new(relative).is_absolute() {
        return Err("relative path must not be absolute".to_string());
    }
    if relative.contains("..") {
        return Err("relative path must not contain '..'".to_string());
    }
    Ok(())
}

/// Validate that `relative` is safely within `project_dir`.
/// Rejects absolute paths and ".." components in `relative`.
fn validate_project_path(project_dir: &str, relative: &str) -> Result<PathBuf, String> {
    validate_relative(relative)?;

    let canonical_root = resolve_project_root(project_dir)?;

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
    let canonical = validate_project_path(&project_dir, &file_path)?;
    fs::read_to_string(&canonical)
        .map_err(|e| format!("Failed to read {}: {}", file_path, e))
}

/// Check if a path exists within a project directory.
/// Pass "." to check if the project directory itself exists.
#[tauri::command]
pub fn sync_file_exists(project_dir: String, file_path: String) -> Result<bool, String> {
    if Path::new(&file_path).is_absolute() || file_path.contains("..") {
        return Err("Invalid file path".to_string());
    }
    // "." asks whether the project directory itself exists, so a missing
    // directory is a legitimate `false` rather than an error — but the root
    // still has to clear the home-directory guard.
    let expanded = expand_tilde(&project_dir);
    if !Path::new(&expanded).exists() {
        return Ok(false);
    }
    let canonical_root = resolve_project_root(&project_dir)?;
    if file_path == "." {
        return Ok(true);
    }
    Ok(canonical_root.join(&file_path).exists())
}

/// List file names in a directory within a project directory.
#[tauri::command]
pub fn sync_read_dir(project_dir: String, dir_path: String) -> Result<Vec<String>, String> {
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

/// Refuse any component of `relative` (under `root`) that is a symbolic link,
/// dangling or not. Uses `symlink_metadata`, which does not follow links;
/// `exists()`/`metadata()` follow them and report a dangling link as absent,
/// which is how a planted dangling link would redirect a create.
fn refuse_symlink_components(root: &Path, relative: &str) -> Result<(), String> {
    let mut walked = root.to_path_buf();
    for segment in Path::new(relative).components() {
        walked.push(segment);
        match fs::symlink_metadata(&walked) {
            Ok(meta) if meta.file_type().is_symlink() => {
                return Err(format!(
                    "Refusing to write '{}': '{}' is a symbolic link",
                    relative,
                    walked.display()
                ));
            }
            Ok(_) => {}
            // Missing component: nothing to follow, and its parent was
            // checked on the previous iteration.
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => {
                return Err(format!("Failed to inspect {}: {}", walked.display(), e));
            }
        }
    }
    Ok(())
}

/// Replace `dest` atomically: stage in a temp file in the same directory,
/// fsync, then rename. A failure removes the temp file and leaves `dest` as it
/// was. The temp file comes from the shared `create_temp`: a fixed-length
/// random name (never built from `dest`'s name, which could pass NAME_MAX),
/// opened with `create_new` so a pre-planted path is refused.
///
/// The result has the replaced file's mode (the temp file starts owner-only,
/// which would otherwise lock out a shared project file), or 0644 for a file
/// that did not exist.
pub(crate) fn write_file_atomically(dest: &Path, bytes: &[u8]) -> Result<(), String> {
    use std::io::Write;
    #[cfg(unix)]
    let mode = {
        use std::os::unix::fs::PermissionsExt;
        match fs::symlink_metadata(dest) {
            Ok(meta) if meta.is_file() => meta.permissions().mode() & 0o777,
            _ => 0o644,
        }
    };
    let (temp, mut file) = super::surface_write::create_temp(dest)?;
    let staged = (|| -> std::io::Result<()> {
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            file.set_permissions(fs::Permissions::from_mode(mode))?;
        }
        file.write_all(bytes)?;
        file.sync_all()?;
        drop(file);
        fs::rename(&temp, dest)
    })();
    if let Err(e) = staged {
        let _ = fs::remove_file(&temp);
        return Err(format!("{}", e));
    }
    Ok(())
}

/// Write compiled output files into a project directory.
///
/// Every component from the project root to the target is checked with
/// `symlink_metadata` before anything is written; any symlink refuses the
/// whole call. The check runs for all files first so a bad path late in the
/// batch cannot leave earlier files half-applied.
#[tauri::command]
pub fn sync_write_files(project_dir: String, files: Vec<SyncFileWrite>) -> Result<(), String> {
    let root = resolve_project_root(&project_dir)?;
    for file in &files {
        validate_relative(&file.relative_path)?;
        refuse_symlink_components(&root, &file.relative_path)?;
    }
    for file in &files {
        let dest = validate_project_path(&project_dir, &file.relative_path)?;
        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent).map_err(|e| {
                format!("Failed to create directory for {}: {}", file.relative_path, e)
            })?;
        }
        write_file_atomically(&dest, file.content.as_bytes())
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

#[cfg(test)]
mod tests {
    use super::*;

    // The guard's logic is tested against explicit paths rather than the
    // ambient HOME: agents.rs, harness_file.rs, mcp.rs and plugins.rs all
    // set_var("HOME", ...) on the shared process env, and cargo runs tests
    // in parallel, so anything reading dirs::home_dir() here is racy.

    // The home/ancestor predicate itself is covered in fs_scope.rs; these
    // tests pin that the *sync bridge* actually consults it.

    #[test]
    fn rejects_an_ancestor_of_the_home_directory() {
        // "/" is an ancestor of home under any HOME value, so this stays
        // deterministic even while another test has HOME reassigned.
        let err = resolve_project_root("/").unwrap_err();
        assert!(err.contains("Refusing to operate on the home directory"));
    }

    #[test]
    fn write_is_refused_when_the_root_is_an_ancestor_of_home() {
        // The reachable shape of the bug: an unconstrained root plus the
        // relative-path writer reaching a dotfile outside any project.
        let result = sync_write_files(
            "/".to_string(),
            vec![SyncFileWrite {
                relative_path: "harness-kit-guard-probe".to_string(),
                content: "should never be written".to_string(),
            }],
        );
        // Assert on the guard's own message: writing under "/" would fail on
        // permissions anyway, so `is_err()` alone would pass even with the
        // guard removed (confirmed by mutation).
        let err = result.unwrap_err();
        assert!(
            err.contains("Refusing to operate on the home directory"),
            "expected the root guard to reject this, got: {err}"
        );
        assert!(!Path::new("/harness-kit-guard-probe").exists());
    }

    #[test]
    fn allows_a_granted_project_directory() {
        let dir = std::env::temp_dir().join("harness-kit-sync-guard-ok");
        fs::create_dir_all(&dir).unwrap();
        super::super::fs_scope::remember_granted_root(dir.canonicalize().unwrap());
        assert!(resolve_project_root(dir.to_str().unwrap()).is_ok());
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn refuses_a_home_subdirectory_that_was_never_granted() {
        // The bug this closes: rejecting only "home and its ancestors" left
        // ~/.ssh, ~/Library/LaunchAgents and ~/.claude usable as project
        // roots, bypassing the registry allowlist entirely.
        let home = dirs::home_dir().unwrap();
        for candidate in [".ssh", ".claude", "Library"] {
            let path = home.join(candidate);
            if !path.exists() {
                continue;
            }
            let err = resolve_project_root(path.to_str().unwrap()).unwrap_err();
            assert!(
                err.contains("not a project directory granted"),
                "{} should be refused, got: {}",
                candidate,
                err
            );
        }
    }

    #[test]
    fn refuses_an_ungranted_directory_outside_home() {
        let dir = std::env::temp_dir().join("harness-kit-sync-ungranted");
        fs::create_dir_all(&dir).unwrap();
        let err = resolve_project_root(dir.to_str().unwrap()).unwrap_err();
        assert!(err.contains("not a project directory granted"));
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn still_rejects_traversal_within_an_allowed_root() {
        let dir = std::env::temp_dir().join("harness-kit-sync-guard-traversal");
        fs::create_dir_all(&dir).unwrap();
        let err = validate_project_path(dir.to_str().unwrap(), "../escape.txt").unwrap_err();
        assert!(err.contains(".."));
        fs::remove_dir_all(&dir).ok();
    }

    // ── Symlink refusal (AC-53) ──────────────────────────────────

    #[cfg(unix)]
    mod symlinks {
        use super::*;
        use std::os::unix::fs::symlink;

        fn granted_project() -> (tempfile::TempDir, String) {
            let tmp = tempfile::tempdir().unwrap();
            let root = tmp.path().canonicalize().unwrap();
            super::super::super::fs_scope::remember_granted_root(root.clone());
            let s = root.to_string_lossy().into_owned();
            (tmp, s)
        }

        fn write(project: &str, rel: &str) -> Result<(), String> {
            sync_write_files(
                project.to_string(),
                vec![SyncFileWrite {
                    relative_path: rel.to_string(),
                    content: "compiled".to_string(),
                }],
            )
        }

        fn assert_refused(result: Result<(), String>) {
            let err = result.unwrap_err();
            assert!(err.contains("symbolic link"), "got: {err}");
        }

        #[test]
        fn normal_path_succeeds_and_leaves_no_temp_files() {
            let (_tmp, project) = granted_project();
            write(&project, "sub/dir/out.md").unwrap();
            let dir = Path::new(&project).join("sub/dir");
            assert_eq!(fs::read_to_string(dir.join("out.md")).unwrap(), "compiled");
            let names: Vec<_> = fs::read_dir(&dir).unwrap().flatten().collect();
            assert_eq!(names.len(), 1, "temp file left behind");
        }

        #[test]
        fn overwrites_an_existing_regular_file() {
            let (_tmp, project) = granted_project();
            fs::write(Path::new(&project).join("out.md"), "old").unwrap();
            write(&project, "out.md").unwrap();
            assert_eq!(
                fs::read_to_string(Path::new(&project).join("out.md")).unwrap(),
                "compiled"
            );
        }

        #[test]
        fn replacing_a_file_keeps_its_mode() {
            use std::os::unix::fs::PermissionsExt;
            let (_tmp, project) = granted_project();
            let file = Path::new(&project).join("run.sh");
            fs::write(&file, "old").unwrap();
            fs::set_permissions(&file, fs::Permissions::from_mode(0o750)).unwrap();
            write(&project, "run.sh").unwrap();
            assert_eq!(fs::read_to_string(&file).unwrap(), "compiled");
            assert_eq!(fs::metadata(&file).unwrap().permissions().mode() & 0o777, 0o750);
        }

        #[test]
        fn a_new_file_is_not_owner_only() {
            use std::os::unix::fs::PermissionsExt;
            let (_tmp, project) = granted_project();
            write(&project, "fresh.md").unwrap();
            let mode = fs::metadata(Path::new(&project).join("fresh.md")).unwrap().permissions().mode();
            assert_eq!(mode & 0o777, 0o644, "project files are shared, not private like temp files");
        }

        #[test]
        fn a_name_near_the_filesystem_limit_still_writes() {
            let (_tmp, project) = granted_project();
            let name = format!("{}.md", "n".repeat(240));
            write(&project, &name).unwrap();
            assert_eq!(
                fs::read_to_string(Path::new(&project).join(&name)).unwrap(),
                "compiled"
            );
            let names: Vec<_> = fs::read_dir(&project).unwrap().flatten().collect();
            assert_eq!(names.len(), 1, "temp file left behind");
        }

        #[test]
        fn refuses_a_symlink_at_the_target() {
            let (_tmp, project) = granted_project();
            let outside = tempfile::tempdir().unwrap();
            let victim = outside.path().join("victim.txt");
            fs::write(&victim, "original").unwrap();
            symlink(&victim, Path::new(&project).join("out.md")).unwrap();
            assert_refused(write(&project, "out.md"));
            assert_eq!(fs::read_to_string(&victim).unwrap(), "original");
        }

        #[test]
        fn refuses_a_symlinked_parent_directory() {
            let (_tmp, project) = granted_project();
            let outside = tempfile::tempdir().unwrap();
            symlink(outside.path(), Path::new(&project).join("linked")).unwrap();
            assert_refused(write(&project, "linked/out.md"));
            assert!(!outside.path().join("out.md").exists());
        }

        #[test]
        fn refuses_a_dangling_symlink_at_the_target() {
            let (_tmp, project) = granted_project();
            let outside = tempfile::tempdir().unwrap();
            let missing = outside.path().join("not-yet.txt");
            symlink(&missing, Path::new(&project).join("out.md")).unwrap();
            assert_refused(write(&project, "out.md"));
            assert!(!missing.exists(), "write followed the dangling link");
        }

        #[test]
        fn refuses_a_dangling_symlink_as_a_parent() {
            let (_tmp, project) = granted_project();
            let outside = tempfile::tempdir().unwrap();
            let missing_dir = outside.path().join("not-yet-dir");
            symlink(&missing_dir, Path::new(&project).join("linked")).unwrap();
            assert_refused(write(&project, "linked/out.md"));
            assert!(!missing_dir.exists(), "create_dir_all followed the link");
        }

        #[test]
        fn a_bad_path_late_in_the_batch_writes_nothing() {
            let (_tmp, project) = granted_project();
            let outside = tempfile::tempdir().unwrap();
            symlink(outside.path(), Path::new(&project).join("linked")).unwrap();
            let result = sync_write_files(
                project.clone(),
                vec![
                    SyncFileWrite {
                        relative_path: "first.md".to_string(),
                        content: "x".to_string(),
                    },
                    SyncFileWrite {
                        relative_path: "linked/second.md".to_string(),
                        content: "y".to_string(),
                    },
                ],
            );
            assert_refused(result);
            assert!(!Path::new(&project).join("first.md").exists());
        }

        #[test]
        fn failed_atomic_write_leaves_destination_and_directory_untouched() {
            let tmp = tempfile::tempdir().unwrap();
            // Destination is a non-empty directory: rename over it fails.
            let dest = tmp.path().join("out.md");
            fs::create_dir(&dest).unwrap();
            fs::write(dest.join("keep"), "k").unwrap();
            assert!(write_file_atomically(&dest, b"new").is_err());
            assert!(dest.join("keep").exists());
            let names: Vec<_> = fs::read_dir(tmp.path()).unwrap().flatten().collect();
            assert_eq!(names.len(), 1, "temp file left behind after failure");
        }
    }

    #[test]
    fn file_exists_reports_false_for_a_missing_root_without_erroring() {
        let missing = std::env::temp_dir().join("harness-kit-sync-guard-absent");
        fs::remove_dir_all(&missing).ok();
        assert_eq!(
            sync_file_exists(missing.to_string_lossy().into_owned(), ".".to_string()),
            Ok(false)
        );
    }
}
