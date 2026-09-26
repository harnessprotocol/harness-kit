use serde::Deserialize;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;


/// The user-scope write allowlist, generated from the TypeScript surface
/// registry (apps/desktop/scripts/generate-write-scope.mjs).
///
/// This command is reachable from any webview JS, so it cannot accept an
/// allowlist from its caller — validating in Rust against a caller-supplied
/// list would be no validation at all. The list is embedded at build time
/// instead, and a TS test asserts the checked-in file still matches the
/// registry.
const WRITE_SCOPE_JSON: &str = include_str!("../../generated/write-scope.json");

#[derive(Debug, Deserialize)]
struct PlatformScope {
    files: Vec<String>,
    directories: Vec<String>,
}

fn scope() -> &'static HashMap<String, PlatformScope> {
    static SCOPE: OnceLock<HashMap<String, PlatformScope>> = OnceLock::new();
    SCOPE.get_or_init(|| {
        serde_json::from_str(WRITE_SCOPE_JSON).expect("generated write-scope.json must parse")
    })
}

fn current_platform() -> &'static str {
    if cfg!(target_os = "macos") {
        "darwin"
    } else if cfg!(target_os = "windows") {
        "win32"
    } else {
        "linux"
    }
}

/// Whether a home-relative path is a config store the registry declares.
/// Segment-aware in both directions: ".claude.json.bak" is not ".claude.json",
/// and ".claude/skillsets/x" is not inside ".claude/skills".
pub(crate) fn is_declared_store(relative: &str) -> bool {
    let normalized = relative.replace('\\', "/");
    // HarnessKit's own state directory. The transaction engine writes preimage
    // backups and its manifest here before touching any config file, so a
    // command that refused them would make rollback impossible — which is the
    // whole point of routing desktop writes through the engine.
    if normalized.starts_with(".harness/") {
        return !normalized.split('/').any(|segment| segment == "..");
    }
    if normalized.is_empty() || normalized.starts_with('/') || normalized.starts_with('~') {
        return false;
    }
    if normalized.split('/').any(|segment| segment == "..") {
        return false;
    }
    let Some(platform) = scope().get(current_platform()) else {
        return false;
    };
    if platform.files.iter().any(|file| file == &normalized) {
        return true;
    }
    platform
        .directories
        .iter()
        .any(|directory| normalized.starts_with(&format!("{}/", directory)))
}

/// `expectedSha256` value meaning "the file must not exist yet".
pub(crate) const ABSENT_SENTINEL: &str = "absent";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SurfaceFileWrite {
    /// Home-relative path of a registry-declared config store.
    pub relative_path: String,
    /// New content, or null to delete the file.
    pub content: Option<String>,
    /// Optional precondition: the lowercase hex SHA-256 of the file's bytes as
    /// the caller last read them, or `"absent"` if it read no file. When set,
    /// the write is refused if the file on disk no longer matches.
    #[serde(default)]
    pub expected_sha256: Option<String>,
}

struct Target {
    relative: String,
    dest: PathBuf,
    content: Option<String>,
    expected: Option<String>,
}

/// Write user-scope config files, accepting only registry-declared stores.
///
/// Deliberately separate from `sync_write_files`, which is project-scoped:
/// giving that command a home root would turn a project-scoped primitive into
/// a general home-directory writer (AC-36).
///
/// Each file is replaced atomically (temp file in the same directory, fsync,
/// rename, fsync the directory), so a reader never sees a half-written file.
/// A batch is NOT atomic across files: every path and every precondition is
/// checked before anything is written, but if writing file 2 of 3 then fails,
/// file 1 stays replaced, file 2 is untouched, and file 3 is not attempted.
/// The error names the files already written. Rollback across files is the
/// caller's job (the TS transaction engine keeps preimage backups for that).
#[tauri::command]
pub fn apply_surface_transaction(files: Vec<SurfaceFileWrite>) -> Result<Vec<String>, String> {
    let home = dirs::home_dir().ok_or("Could not resolve home directory")?;
    apply_surface_transaction_in(&home, files)
}

/// The command body with the home directory injected, so tests run against a
/// tempdir instead of the real home (and never mutate the process-global HOME).
fn apply_surface_transaction_in(
    home: &Path,
    files: Vec<SurfaceFileWrite>,
) -> Result<Vec<String>, String> {
    let canonical_home = home.canonicalize().unwrap_or_else(|_| home.to_path_buf());

    // Validate every path before mutating any of them.
    let mut targets: Vec<Target> = Vec::new();
    for file in files {
        if !is_declared_store(&file.relative_path) {
            return Err(format!(
                "Refusing to write '{}': not a config store the surface registry declares",
                file.relative_path
            ));
        }
        let dest = canonical_home.join(&file.relative_path);

        // Walk EVERY component, the final one included. Canonicalizing only
        // the parent let a symlink at the leaf redirect the write anywhere the
        // user can write — and skills directories are populated by
        // third-party plugin installs, so a planted symlink is a realistic
        // precondition. This mirrors the TS engine's assertNoSymlinkBoundary,
        // which already walks the full path.
        let mut walked = canonical_home.clone();
        for segment in Path::new(&file.relative_path).components() {
            walked = walked.join(segment);
            match std::fs::symlink_metadata(&walked) {
                Ok(meta) if meta.file_type().is_symlink() => {
                    return Err(format!(
                        "Refusing to write '{}': '{}' is a symbolic link",
                        file.relative_path,
                        walked.display()
                    ));
                }
                // A component that does not exist yet cannot be a symlink;
                // its parent was already checked on the previous iteration.
                _ => {}
            }
        }

        // The parent must resolve INSIDE home — home itself included, since
        // ~/.claude.json's parent IS home. (An earlier version reused the
        // home-or-ancestor predicate here, which made every top-level store
        // permanently unwritable.)
        if let Some(parent) = dest.parent() {
            if let Ok(canonical_parent) = parent.canonicalize() {
                if !canonical_parent.starts_with(&canonical_home) {
                    return Err(format!(
                        "Refusing to write '{}': resolves outside the home directory",
                        file.relative_path
                    ));
                }
            }
        }
        targets.push(Target {
            relative: file.relative_path,
            dest,
            content: file.content,
            expected: file.expected_sha256,
        });
    }

    // Check every precondition up front too, so a batch whose LAST file is
    // stale writes nothing. Each is checked again just before its rename.
    for target in &targets {
        if let Some(expected) = &target.expected {
            check_unchanged(&target.dest, expected, &target.relative)?;
        }
    }

    let mut written: Vec<String> = Vec::new();
    for target in targets {
        let outcome = match &target.content {
            Some(text) => write_atomically(
                &target.dest,
                text.as_bytes(),
                target.expected.as_deref(),
                &target.relative,
            ),
            None => remove_if_present(&target.dest, target.expected.as_deref(), &target.relative),
        };
        if let Err(error) = outcome {
            if written.is_empty() {
                return Err(error);
            }
            return Err(format!(
                "{} (already written and not rolled back: {})",
                error,
                written.join(", ")
            ));
        }
        written.push(target.dest.to_string_lossy().into_owned());
    }
    Ok(written)
}

fn sha256_hex(bytes: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{:02x}", byte))
        .collect()
}

/// The file's current digest, or the absent sentinel when there is no file.
fn current_digest(dest: &Path) -> Result<String, String> {
    match fs::read(dest) {
        Ok(bytes) => Ok(sha256_hex(&bytes)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            Ok(ABSENT_SENTINEL.to_string())
        }
        Err(error) => Err(format!("Failed to read {}: {}", dest.display(), error)),
    }
}

fn check_unchanged(dest: &Path, expected: &str, relative: &str) -> Result<(), String> {
    let actual = current_digest(dest)?;
    if actual != expected.to_ascii_lowercase() {
        return Err(format!(
            "Refusing to write '{}': it changed on disk since it was read (expected {}, found {})",
            relative, expected, actual
        ));
    }
    Ok(())
}

/// Create a fresh temp file beside `dest`. The name comes from the
/// destination plus a random suffix, never from the caller, and the file is
/// created exclusively so an existing file or planted symlink is never
/// opened. Owner-only from the first byte on unix.
fn create_temp(dest: &Path) -> Result<(PathBuf, fs::File), String> {
    let parent = dest
        .parent()
        .ok_or_else(|| format!("{} has no parent directory", dest.display()))?;
    let name = dest
        .file_name()
        .ok_or_else(|| format!("{} has no file name", dest.display()))?
        .to_string_lossy();
    let mut last_error = None;
    for _ in 0..8 {
        let temp = parent.join(format!("{}.hk-tmp-{}", name, uuid::Uuid::new_v4().simple()));
        let mut options = fs::OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        match options.open(&temp) {
            Ok(file) => return Ok((temp, file)),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                last_error = Some(error);
            }
            Err(error) => {
                return Err(format!("Failed to create a temp file beside {}: {}", dest.display(), error))
            }
        }
    }
    Err(format!(
        "Failed to create a temp file beside {}: {}",
        dest.display(),
        last_error.map(|e| e.to_string()).unwrap_or_default()
    ))
}

/// Replace `dest` with `bytes` so that it is always either the old file or
/// the new one, never a partial write.
///
/// 1. create an exclusive temp file in the destination's directory
/// 2. set its mode: the replaced file's mode, or 0600 for a new file (unix)
/// 3. write the bytes and fsync the temp file
/// 4. if a precondition was given, re-hash the destination and refuse on a
///    mismatch
/// 5. rename the temp over the destination
/// 6. fsync the directory so the rename itself is durable (unix)
///
/// Any failure in 1–5 removes the temp file and leaves the destination as it
/// was. The precondition check in 4 is not a lock: a writer that lands
/// between the check and the rename is still overwritten. That window is
/// microseconds, against the minutes a page may sit open between read and
/// save, which is the race this closes.
fn write_atomically(
    dest: &Path,
    bytes: &[u8],
    expected: Option<&str>,
    relative: &str,
) -> Result<(), String> {
    let parent = dest
        .parent()
        .ok_or_else(|| format!("{} has no parent directory", dest.display()))?;
    fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory: {}", e))?;

    // Read the replaced file's mode before anything is written. The path was
    // checked for symlinks during validation; symlink_metadata keeps it that
    // way here, and only a regular file donates its mode.
    #[cfg(unix)]
    let mode = {
        use std::os::unix::fs::PermissionsExt;
        match fs::symlink_metadata(dest) {
            Ok(meta) if meta.is_file() => meta.permissions().mode() & 0o777,
            _ => 0o600,
        }
    };

    let (temp, mut file) = create_temp(dest)?;
    let staged = (|| -> Result<(), String> {
        use std::io::Write;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            // Explicit, so the umask cannot narrow or the default widen it.
            file.set_permissions(fs::Permissions::from_mode(mode))
                .map_err(|e| format!("Failed to set permissions on {}: {}", temp.display(), e))?;
        }
        file.write_all(bytes)
            .map_err(|e| format!("Failed to write {}: {}", dest.display(), e))?;
        file.sync_all()
            .map_err(|e| format!("Failed to sync {}: {}", dest.display(), e))?;
        drop(file);
        if let Some(expected) = expected {
            check_unchanged(dest, expected, relative)?;
        }
        fs::rename(&temp, dest)
            .map_err(|e| format!("Failed to replace {}: {}", dest.display(), e))
    })();
    if let Err(error) = staged {
        let _ = fs::remove_file(&temp);
        return Err(error);
    }

    sync_directory(parent).map_err(|e| {
        format!(
            "{} was replaced, but syncing its directory failed, so the change may not survive a crash: {}",
            dest.display(),
            e
        )
    })
}

#[cfg(unix)]
fn sync_directory(directory: &Path) -> std::io::Result<()> {
    fs::File::open(directory)?.sync_all()
}

#[cfg(not(unix))]
fn sync_directory(_directory: &Path) -> std::io::Result<()> {
    Ok(())
}

fn remove_if_present(dest: &Path, expected: Option<&str>, relative: &str) -> Result<(), String> {
    if let Some(expected) = expected {
        check_unchanged(dest, expected, relative)?;
    }
    if dest.exists() {
        fs::remove_file(dest).map_err(|e| format!("Failed to remove {}: {}", dest.display(), e))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_a_declared_store() {
        assert!(is_declared_store(".claude.json"));
        assert!(is_declared_store(".codex/config.toml"));
    }

    #[test]
    fn accepts_a_file_beneath_a_declared_directory() {
        assert!(is_declared_store(".claude/skills/review/SKILL.md"));
    }

    #[test]
    fn accepts_harness_own_state_directory() {
        // Backups and manifests must be writable or nothing is rollback-able.
        assert!(is_declared_store(".harness/backups/2026-09-01/transaction.json"));
        assert!(!is_declared_store(".harness/../.ssh/id_rsa"));
    }

    #[test]
    fn rejects_a_store_the_engine_only_reads() {
        // Plugin state is enumerated, never written BY THE SURFACE ENGINE:
        // installing goes through the surface's own installer, and editing
        // the install record by hand would leave it disagreeing with the
        // surface's cache. The generated allowlist is derived from WRITABLE
        // stores, so this file never reaches this command even though the
        // registry declares it. Note the scope of that guarantee: the
        // separate plugins.rs command does rewrite installed_plugins.json on
        // its uninstall path, so this is an invariant of the surface write
        // path, not of the whole app.
        assert!(!is_declared_store(".claude/plugins/installed_plugins.json"));
        assert!(!is_declared_store(".claude/plugins/known_marketplaces.json"));
        // Formats with no writer this milestone are out too.
        assert!(!is_declared_store(".claude/settings.json"));
        assert!(!is_declared_store(".cursor/cli-config.json"));
        // ~/.codex/config.toml stays writable: the MCP codec edits it, and
        // its managed region is [mcp_servers.*] alone.
        assert!(is_declared_store(".codex/config.toml"));
    }

    #[test]
    fn rejects_an_undeclared_path() {
        assert!(!is_declared_store(".zshrc"));
        assert!(!is_declared_store(".ssh/id_rsa"));
        assert!(!is_declared_store(".claude/settings.local.json"));
    }

    #[test]
    fn rejects_a_shared_string_prefix() {
        // Segment-aware, not string-prefix.
        assert!(!is_declared_store(".claude.json.bak"));
        assert!(!is_declared_store(".claude/skillsets/x.md"));
    }

    #[test]
    fn rejects_traversal_and_absolute_forms() {
        for path in ["../.ssh/id_rsa", "/etc/passwd", "~/.zshrc", ".claude/../../x", ""] {
            assert!(!is_declared_store(path), "{} should be rejected", path);
        }
    }

    // ── Write path, against a tempdir home ────────────────────────────

    use tempfile::TempDir;

    fn write(relative: &str, content: &str) -> SurfaceFileWrite {
        SurfaceFileWrite {
            relative_path: relative.to_string(),
            content: Some(content.to_string()),
            expected_sha256: None,
        }
    }

    fn write_expecting(relative: &str, content: &str, expected: &str) -> SurfaceFileWrite {
        SurfaceFileWrite {
            expected_sha256: Some(expected.to_string()),
            ..write(relative, content)
        }
    }

    fn temp_files_in(directory: &Path) -> Vec<String> {
        fs::read_dir(directory)
            .map(|entries| {
                entries
                    .filter_map(|entry| entry.ok())
                    .map(|entry| entry.file_name().to_string_lossy().into_owned())
                    .filter(|name| name.contains(".hk-tmp-"))
                    .collect()
            })
            .unwrap_or_default()
    }

    #[cfg(unix)]
    fn mode_of(path: &Path) -> u32 {
        use std::os::unix::fs::PermissionsExt;
        fs::metadata(path).unwrap().permissions().mode() & 0o777
    }

    #[test]
    fn write_is_refused_for_an_undeclared_path() {
        let home = TempDir::new().unwrap();
        let result = apply_surface_transaction_in(
            home.path(),
            vec![write(".harness-kit-surface-probe", "should never be written")],
        );
        let err = result.unwrap_err();
        assert!(err.contains("not a config store"));
        assert!(!home.path().join(".harness-kit-surface-probe").exists());
    }

    #[test]
    fn can_write_a_top_level_home_store() {
        // ~/.claude.json's parent IS the home directory. A guard that treats
        // "parent is home" as an escape makes the flagship Claude Code store
        // permanently unwritable.
        let home = TempDir::new().unwrap();
        let result = apply_surface_transaction_in(home.path(), vec![write(".claude.json", "{}")]);
        assert!(result.is_ok(), "expected ok, got: {:?}", result);
        assert_eq!(fs::read_to_string(home.path().join(".claude.json")).unwrap(), "{}");
    }

    #[cfg(unix)]
    #[test]
    fn replaces_content_and_keeps_the_replaced_files_mode() {
        use std::os::unix::fs::PermissionsExt;
        let home = TempDir::new().unwrap();
        let store = home.path().join(".claude.json");
        fs::write(&store, "{\"old\":true}").unwrap();
        fs::set_permissions(&store, fs::Permissions::from_mode(0o640)).unwrap();

        apply_surface_transaction_in(home.path(), vec![write(".claude.json", "{\"new\":true}")])
            .unwrap();

        assert_eq!(fs::read_to_string(&store).unwrap(), "{\"new\":true}");
        assert_eq!(mode_of(&store), 0o640);
        assert!(temp_files_in(home.path()).is_empty());
    }

    #[cfg(unix)]
    #[test]
    fn a_new_file_is_owner_only() {
        let home = TempDir::new().unwrap();
        apply_surface_transaction_in(home.path(), vec![write(".codex/config.toml", "x = 1\n")])
            .unwrap();
        let store = home.path().join(".codex/config.toml");
        assert_eq!(fs::read_to_string(&store).unwrap(), "x = 1\n");
        assert_eq!(mode_of(&store), 0o600);
        assert!(temp_files_in(&home.path().join(".codex")).is_empty());
    }

    #[test]
    fn a_matching_precondition_writes() {
        let home = TempDir::new().unwrap();
        let store = home.path().join(".claude.json");
        fs::write(&store, "{\"a\":1}\n").unwrap();
        let digest = sha256_hex(b"{\"a\":1}\n");

        apply_surface_transaction_in(
            home.path(),
            vec![write_expecting(".claude.json", "{\"a\":2}\n", &digest.to_uppercase())],
        )
        .unwrap();
        assert_eq!(fs::read_to_string(&store).unwrap(), "{\"a\":2}\n");
    }

    #[test]
    fn a_stale_precondition_refuses_and_leaves_the_file_byte_identical() {
        let home = TempDir::new().unwrap();
        let store = home.path().join(".claude.json");
        let on_disk = b"{\"projects\":{},\"numStartups\":9}\n";
        fs::write(&store, on_disk).unwrap();
        let stale = sha256_hex(b"{\"projects\":{},\"numStartups\":8}\n");

        let err = apply_surface_transaction_in(
            home.path(),
            vec![write_expecting(".claude.json", "{}", &stale)],
        )
        .unwrap_err();

        assert!(err.contains("changed on disk since it was read"), "got: {}", err);
        assert_eq!(fs::read(&store).unwrap(), on_disk);
        assert!(temp_files_in(home.path()).is_empty());
    }

    #[test]
    fn the_absent_sentinel_means_the_file_must_not_exist() {
        let home = TempDir::new().unwrap();
        let store = home.path().join(".claude.json");

        apply_surface_transaction_in(
            home.path(),
            vec![write_expecting(".claude.json", "{}\n", ABSENT_SENTINEL)],
        )
        .unwrap();
        assert_eq!(fs::read_to_string(&store).unwrap(), "{}\n");

        // Now it exists, so "absent" is stale.
        let err = apply_surface_transaction_in(
            home.path(),
            vec![write_expecting(".claude.json", "{\"b\":1}\n", ABSENT_SENTINEL)],
        )
        .unwrap_err();
        assert!(err.contains("changed on disk since it was read"), "got: {}", err);
        assert_eq!(fs::read_to_string(&store).unwrap(), "{}\n");
    }

    #[test]
    fn a_precondition_that_fails_at_rename_time_removes_the_temp_file() {
        // The up-front check passes in the command; this drives the second
        // check, the one made after the temp file is written.
        let home = TempDir::new().unwrap();
        let store = home.path().join(".claude.json");
        fs::write(&store, "{\"moved\":true}").unwrap();

        let err = write_atomically(&store, b"{}", Some(&sha256_hex(b"{}")), ".claude.json")
            .unwrap_err();
        assert!(err.contains("changed on disk since it was read"), "got: {}", err);
        assert_eq!(fs::read_to_string(&store).unwrap(), "{\"moved\":true}");
        assert!(temp_files_in(home.path()).is_empty());
    }

    #[test]
    fn a_failed_rename_removes_the_temp_file() {
        // A directory where the file should be: the rename fails after the
        // temp file was written.
        let home = TempDir::new().unwrap();
        let skill = home.path().join(".claude/skills/review");
        fs::create_dir_all(skill.join("SKILL.md")).unwrap();

        let err = apply_surface_transaction_in(
            home.path(),
            vec![write(".claude/skills/review/SKILL.md", "# Review\n")],
        )
        .unwrap_err();
        assert!(err.contains("Failed to replace"), "got: {}", err);
        assert!(skill.join("SKILL.md").is_dir());
        assert!(temp_files_in(&skill).is_empty());
    }

    #[test]
    fn a_stale_precondition_anywhere_in_a_batch_writes_nothing() {
        let home = TempDir::new().unwrap();
        fs::write(home.path().join(".claude.json"), "{}").unwrap();

        let err = apply_surface_transaction_in(
            home.path(),
            vec![
                write(".codex/config.toml", "x = 1\n"),
                write_expecting(".claude.json", "{\"a\":1}", &sha256_hex(b"not this")),
            ],
        )
        .unwrap_err();
        assert!(err.contains("changed on disk since it was read"), "got: {}", err);
        assert!(!home.path().join(".codex/config.toml").exists());
        assert_eq!(fs::read_to_string(home.path().join(".claude.json")).unwrap(), "{}");
    }

    #[test]
    fn a_batch_that_fails_midway_names_what_it_already_wrote() {
        // Not atomic across files: the first file stays written, and the
        // error says so rather than implying nothing changed.
        let home = TempDir::new().unwrap();
        fs::create_dir_all(home.path().join(".claude/skills/review/SKILL.md")).unwrap();

        let err = apply_surface_transaction_in(
            home.path(),
            vec![
                write(".codex/config.toml", "x = 1\n"),
                write(".claude/skills/review/SKILL.md", "# Review\n"),
            ],
        )
        .unwrap_err();
        assert!(err.contains("already written and not rolled back"), "got: {}", err);
        assert!(err.contains("config.toml"), "got: {}", err);
        assert_eq!(
            fs::read_to_string(home.path().join(".codex/config.toml")).unwrap(),
            "x = 1\n"
        );
    }

    #[test]
    fn a_null_content_deletes_the_file() {
        let home = TempDir::new().unwrap();
        let store = home.path().join(".codex/config.toml");
        fs::create_dir_all(store.parent().unwrap()).unwrap();
        fs::write(&store, "x = 1\n").unwrap();

        apply_surface_transaction_in(
            home.path(),
            vec![SurfaceFileWrite {
                relative_path: ".codex/config.toml".to_string(),
                content: None,
                expected_sha256: None,
            }],
        )
        .unwrap();
        assert!(!store.exists());
    }

    #[cfg(unix)]
    #[test]
    fn refuses_a_symlinked_leaf_inside_a_declared_directory() {
        let home = TempDir::new().unwrap();
        let outside = TempDir::new().unwrap();
        let skills = home.path().join(".claude/skills");
        fs::create_dir_all(&skills).unwrap();
        let target = outside.path().join("escape.txt");
        std::os::unix::fs::symlink(&target, skills.join("harness-kit-symlink-guard")).unwrap();

        let result = apply_surface_transaction_in(
            home.path(),
            vec![write(".claude/skills/harness-kit-symlink-guard", "should never be written")],
        );
        assert!(result.unwrap_err().contains("symbolic link"));
        assert!(!target.exists(), "write escaped to {}", target.display());
        assert!(temp_files_in(&skills).is_empty());
    }

    #[cfg(unix)]
    #[test]
    fn refuses_a_symlinked_directory_on_the_way_to_the_store() {
        let home = TempDir::new().unwrap();
        let outside = TempDir::new().unwrap();
        std::os::unix::fs::symlink(outside.path(), home.path().join(".codex")).unwrap();

        let result =
            apply_surface_transaction_in(home.path(), vec![write(".codex/config.toml", "x = 1\n")]);
        assert!(result.unwrap_err().contains("symbolic link"));
        assert!(!outside.path().join("config.toml").exists());
    }

    #[test]
    fn a_single_bad_path_blocks_the_whole_batch() {
        // Validation happens before any mutation, so a mixed batch writes
        // nothing rather than partially applying. The good path goes first,
        // so a write-as-you-validate loop would leave it behind, and the
        // assertion names the reason.
        let home = TempDir::new().unwrap();
        let result = apply_surface_transaction_in(
            home.path(),
            vec![write(".claude.json", "{}"), write(".zshrc", "pwned")],
        );
        let err = result.unwrap_err();
        assert!(err.contains("not a config store"), "got: {}", err);
        assert!(!home.path().join(".zshrc").exists());
        assert!(!home.path().join(".claude.json").exists());
    }
}

