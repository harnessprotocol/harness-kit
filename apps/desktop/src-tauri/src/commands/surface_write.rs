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

/// The transaction engine's preimage backups and manifests, and NOTHING else
/// under ~/.harness — that directory also holds harness.db, harness.yaml,
/// device.json and exchange/identity.key, which this webview-reachable
/// command must not be able to touch. Scoped to backups/ rather than the
/// whole state directory. Backups are verbatim copies of config stores, and
/// ~/.claude.json carries MCP env values (tokens), so everything written here
/// is private to the user regardless of umask. Unix only: on Windows the
/// modes are not applied and privacy rests on the profile directory's ACL.
fn is_state_path(normalized: &str) -> bool {
    normalized.starts_with(".harness/backups/")
}

/// Whether a home-relative path is a config store the registry declares.
/// Segment-aware in both directions: ".claude.json.bak" is not ".claude.json",
/// and ".claude/skillsets/x" is not inside ".claude/skills".
pub(crate) fn is_declared_store(relative: &str) -> bool {
    let normalized = relative.replace('\\', "/");
    // Every segment must be a real name. This one check rejects the empty
    // path, an absolute path (leading "/"), "//", traversal, and a trailing "/"
    // or "." (and a NUL byte, which no real path holds). The trailing two
    // matter because ".claude/skills/" and ".harness/backups/." pass the
    // prefix checks below yet name the DIRECTORY, and the write would create
    // a regular file where the directory belongs; a `.` segment would also
    // let the write path's parent, where the temp file is created, resolve
    // above the declared directory (`.claude/skills/.` has parent `.claude`).
    // Checked before the state-directory branch so that branch is covered too.
    if normalized
        .split('/')
        .any(|segment| segment.is_empty() || segment == "." || segment == "..")
        || normalized.contains('\0')
    {
        return false;
    }
    // The transaction engine's own backups and manifest, scoped to that one
    // subtree (see is_state_path). The engine writes them here before touching
    // any config file, so a command that refused them would make rollback
    // impossible — which is the whole point of routing desktop writes through
    // the engine.
    if is_state_path(&normalized) {
        return true;
    }
    if normalized.starts_with('~') {
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

/// Whether a project-root-relative path is a store the app compiles to inside a
/// project, or part of the engine's project-local backups. The store list is
/// the `project` entry of the generated write scope, derived from the registry's
/// writable project-scope stores (`projectWriteScope` in packages/core), so a
/// project's `.git/`, `.claude/settings.json` (hooks) and arbitrary files are
/// not on it. `.harness/backups/` is the engine's per-project preimage and
/// manifest subtree. Same segment rules as [`is_declared_store`].
pub(crate) fn is_declared_project_store(relative: &str) -> bool {
    let normalized = relative.replace('\\', "/");
    if normalized
        .split('/')
        .any(|segment| segment.is_empty() || segment == "." || segment == "..")
        || normalized.contains('\0')
    {
        return false;
    }
    if is_state_path(&normalized) {
        return true;
    }
    let Some(project) = scope().get("project") else {
        return false;
    };
    if project.files.iter().any(|file| file == &normalized) {
        return true;
    }
    project
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
    /// Optional precondition: the file as the caller last read it, or
    /// `"absent"` if it read no file. When set, the write is refused if the
    /// file on disk no longer matches.
    ///
    /// The digest is over the file's TEXT as the webview reads it, not its
    /// raw bytes, because the webview can only read text (the capability
    /// grants `fs:allow-read-text-file`, whose TextDecoder drops a BOM and
    /// replaces invalid UTF-8). Precisely, lowercase hex of
    /// SHA-256(UTF-8(decode(strip_bom(bytes)))), where `strip_bom` removes one
    /// leading EF BB BF and `decode` is UTF-8 with each maximal invalid
    /// subpart replaced by U+FFFD (WHATWG TextDecoder; Rust
    /// `String::from_utf8_lossy`). See [`precondition_digest`]. Case is
    /// ignored on comparison.
    ///
    /// So two files that decode to the same text match: a BOM added or
    /// removed, or one invalid byte swapped for another, is not seen as a
    /// change. The write stores `content` exactly as given, so a BOM present
    /// before a save is gone after it. Both are acceptable for the JSON
    /// stores this guards: RFC 8259 §8.1 says JSON must be UTF-8 and writers
    /// must not add a BOM.
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
/// A file whose rename landed but whose directory fsync failed counts as
/// written: the batch stops there with an error that says it was replaced,
/// and lists it among the files already written.
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
    apply_surface_transaction_with(home, files, sync_directory)
}

/// As above, with the directory fsync injected so tests can make it fail.
fn apply_surface_transaction_with(
    home: &Path,
    files: Vec<SurfaceFileWrite>,
    sync: fn(&Path) -> std::io::Result<()>,
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
        // Validation, the symlink walk, and the write must all see the SAME
        // string. is_declared_store normalizes "\\" to "/", so joining the raw
        // path would let ".claude\\skills\\x" pass validation and then be
        // created as a single oddly named file in home on unix.
        let relative = file.relative_path.replace('\\', "/");
        let dest = canonical_home.join(&relative);

        // Walk EVERY component, the final one included. Canonicalizing only
        // the parent let a symlink at the leaf redirect the write anywhere the
        // user can write — and skills directories are populated by
        // third-party plugin installs, so a planted symlink is a realistic
        // precondition. This mirrors the TS engine's assertNoSymlinkBoundary,
        // which already walks the full path.
        let mut walked = canonical_home.clone();
        for segment in Path::new(&relative).components() {
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
            relative,
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

    // A file the owner cannot write is one the user locked. An in-place write
    // failed on it; rename and unlink only need the directory to be writable,
    // so without this both would override the lock. Checked here, with the
    // other refusals, so a locked file anywhere in a batch writes nothing and
    // creates no directories.
    for target in &targets {
        refuse_read_only(&target.dest, &target.relative)?;
    }

    let mut written: Vec<String> = Vec::new();
    for target in targets {
        let outcome = match &target.content {
            Some(text) => write_atomically(
                &target.dest,
                text.as_bytes(),
                target.expected.as_deref(),
                &target.relative,
                sync,
            ),
            None => remove_if_present(&target.dest, target.expected.as_deref(), &target.relative)
                .map_err(WriteFailure::Unchanged),
        };
        if let Err(failure) = outcome {
            let error = match failure {
                WriteFailure::Unchanged(error) => error,
                WriteFailure::ReplacedNotDurable(error) => {
                    written.push(target.dest.to_string_lossy().into_owned());
                    error
                }
            };
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

/// The `expectedSha256` digest of a file's bytes: SHA-256 of its text as the
/// webview's `readTextFile` returns it. That is a WHATWG TextDecoder("utf-8"):
/// it drops one leading BOM and replaces each maximal invalid subpart with
/// U+FFFD, which is what `from_utf8_lossy` does too.
pub(crate) fn precondition_digest(bytes: &[u8]) -> String {
    let body = bytes.strip_prefix(b"\xEF\xBB\xBF").unwrap_or(bytes);
    sha256_hex(String::from_utf8_lossy(body).as_bytes())
}

/// The file's current precondition digest, or the absent sentinel when there
/// is no file.
fn current_digest(dest: &Path) -> Result<String, String> {
    // Only a regular file is hashed. Reading a FIFO planted at a store path
    // would block the command forever.
    match fs::symlink_metadata(dest) {
        Ok(meta) if !meta.is_file() => {
            return Err(format!("{} is not a regular file", dest.display()));
        }
        _ => {}
    }
    match fs::read(dest) {
        Ok(bytes) => Ok(precondition_digest(&bytes)),
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

/// Create a fresh temp file beside `dest`. The name is fixed-length and comes
/// from a random suffix, never from the caller or the destination: embedding
/// the destination's name pushed a long store name past NAME_MAX (255) that a
/// plain write handled. The file is
/// created exclusively so an existing file or planted symlink is never
/// opened. Owner-only from the first byte on unix.
pub(crate) fn create_temp(dest: &Path) -> Result<(PathBuf, fs::File), String> {
    let parent = dest
        .parent()
        .ok_or_else(|| format!("{} has no parent directory", dest.display()))?;
    if dest.file_name().is_none() {
        return Err(format!("{} has no file name", dest.display()));
    }
    let mut last_error = None;
    for _ in 0..8 {
        let temp = parent.join(format!(".hk-tmp-{}", uuid::Uuid::new_v4().simple()));
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
/// 4. if a precondition was given, re-digest the destination (see
///    [`precondition_digest`]) and refuse on a mismatch
/// 5. rename the temp over the destination
/// 6. fsync the directory so the rename itself is durable (unix)
///
/// Rename replaces the directory entry rather than writing through the inode.
/// So a hardlink to `dest` is severed (which also defuses a planted one),
/// ownership, ACLs and xattrs are reset to the current user's, and the
/// containing directory must be writable, which an in-place write did not
/// need. That last point is why an owner-read-only destination is refused
/// (`refuse_read_only`, in the validation pass, before anything is written):
/// rename would otherwise quietly override a deliberate chmod 0400.
///
/// Files under `.harness/` are always 0600 and the directories created for
/// them 0700. Existing directories are left as they are.
///
/// Any failure in 1–5 removes the temp file and leaves the destination as it
/// was ([`WriteFailure::Unchanged`]). A failure in 6 comes after the file was
/// replaced ([`WriteFailure::ReplacedNotDurable`]). The precondition check in 4 is not a lock: a writer that lands
/// between the check and the rename is still overwritten. That window is
/// microseconds, against the minutes a page may sit open between read and
/// save, which is the race this closes.
fn write_atomically(
    dest: &Path,
    bytes: &[u8],
    expected: Option<&str>,
    relative: &str,
    sync: fn(&Path) -> std::io::Result<()>,
) -> Result<(), WriteFailure> {
    let parent = dest
        .parent()
        .ok_or_else(|| format!("{} has no parent directory", dest.display()))?;
    create_parent_dirs(parent, is_state_path(relative))
        .map_err(|e| format!("Failed to create directory: {}", e))?;

    // Read the replaced file's mode before anything is written. The path was
    // checked for symlinks during validation; symlink_metadata keeps it that
    // way here, and only a regular file donates its mode.
    #[cfg(unix)]
    let mode = {
        use std::os::unix::fs::PermissionsExt;
        match fs::symlink_metadata(dest) {
            // HarnessKit's own files: always private, even when replacing an
            // older backup or manifest that an earlier build left looser (or
            // read-only). The read-only refusal does not apply to them.
            _ if is_state_path(relative) => 0o600,
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
        return Err(WriteFailure::Unchanged(error));
    }

    sync(parent).map_err(|e| {
        WriteFailure::ReplacedNotDurable(format!(
            "{} was replaced, but syncing its directory failed, so the change may not survive a crash: {}",
            dest.display(),
            e
        ))
    })
}

/// Why a single-file write failed, split by whether the file was replaced.
#[derive(Debug)]
enum WriteFailure {
    /// The destination is as it was.
    Unchanged(String),
    /// The rename landed, so the new content is in place, but the directory
    /// fsync failed: the replacement may not survive a crash. The batch must
    /// still count the file as written, or rollback would skip it.
    ReplacedNotDurable(String),
}

impl From<String> for WriteFailure {
    fn from(message: String) -> Self {
        WriteFailure::Unchanged(message)
    }
}

#[cfg(unix)]
fn sync_directory(directory: &Path) -> std::io::Result<()> {
    fs::File::open(directory)?.sync_all()
}

#[cfg(not(unix))]
fn sync_directory(_directory: &Path) -> std::io::Result<()> {
    Ok(())
}

/// The digest a webview computes for text it loaded from a user config file:
/// SHA-256 of the text with one leading BOM dropped (see [`precondition_digest`]).
#[cfg(test)]
pub(crate) fn loaded_text_digest(text: &str) -> String {
    precondition_digest(text.as_bytes())
}

/// Where user-file backups go, relative to the home directory. Never beside
/// the file: a dotfile symlinked into a git repo (or `~/.claude` itself being
/// one) would put a copy of its secrets, such as MCP tokens in `~/.claude.json`,
/// where `git add -A` picks them up.
pub(crate) const USER_BACKUPS_DIR: &str = ".harness/backups/user";

#[cfg(test)]
thread_local! {
    static TEST_HOME: std::cell::RefCell<Option<PathBuf>> = const { std::cell::RefCell::new(None) };
}

/// Tests that look at backups name the home they go under. One that does not
/// gets a private temp directory for its thread, never the real `~/.harness`.
#[cfg(test)]
pub(crate) fn set_test_home(home: &Path) {
    TEST_HOME.with(|h| *h.borrow_mut() = Some(home.to_path_buf()));
}

/// Every file under `home`'s user backups, sorted, for tests to inspect.
#[cfg(test)]
pub(crate) fn user_backups(home: &Path) -> Vec<PathBuf> {
    fn walk(dir: &Path, out: &mut Vec<PathBuf>) {
        let Ok(entries) = fs::read_dir(dir) else { return };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                walk(&path, out);
            } else {
                out.push(path);
            }
        }
    }
    let mut out = Vec::new();
    walk(&home.join(USER_BACKUPS_DIR), &mut out);
    out.sort();
    out
}

fn backup_home() -> Result<PathBuf, String> {
    #[cfg(test)]
    {
        thread_local! {
            static SCRATCH: tempfile::TempDir = tempfile::tempdir().unwrap();
        }
        return Ok(TEST_HOME
            .with(|h| h.borrow().clone())
            .unwrap_or_else(|| SCRATCH.with(|d| d.path().to_path_buf())));
    }
    #[cfg(not(test))]
    dirs::home_dir().ok_or_else(|| "Could not resolve the home directory".to_string())
}

/// The home-relative path of the LINK the user knows the file by (not its
/// symlink target), `/`-separated. A path outside the home directory (a
/// `~/.claude` symlinked to a dotfiles repo hands callers the canonical
/// location) keeps its absolute components under `_outside_home/`.
fn backup_relative(link: &Path, home: &Path) -> String {
    let canonical_home = home.canonicalize().ok();
    let inside = link
        .strip_prefix(home)
        .ok()
        .or_else(|| canonical_home.as_deref().and_then(|h| link.strip_prefix(h).ok()));
    let (prefix, path) = match inside {
        Some(rest) => ("", rest),
        None => ("_outside_home/", link),
    };
    let names: Vec<String> = path
        .components()
        .filter_map(|c| match c {
            std::path::Component::Normal(n) => Some(n.to_string_lossy().into_owned()),
            _ => None,
        })
        .collect();
    format!("{prefix}{}", names.join("/"))
}

/// The shared save path for user config files outside the surface registry
/// (AC-50): refuse if the file changed on disk since the caller loaded it,
/// copy the old content to `~/.harness/backups/user/<UTC stamp>/<home-relative
/// path of `dest`>` (directories 0700, file 0600), then replace the file
/// atomically (temp file + rename). Nothing truncates the destination in place.
///
/// `expected_sha256` is the digest of what the caller loaded
/// ([`loaded_text_digest`] on the webview side); `None` means the file must
/// not exist. Returns the backup path when one was written.
///
/// A symlinked `dest` is followed to its final target: the digest check and the
/// atomic write happen at the target and the link stays. The backup is keyed by
/// the LINK's path, and lives under the home directory, not beside the target.
/// This is for user-scope files only (a dotfile the user pointed at their
/// dotfiles repo); project writes refuse symlinks (`sync_write_files`).
pub(crate) fn write_user_file(
    link: &Path,
    content: &str,
    expected_sha256: Option<&str>,
) -> Result<Option<PathBuf>, String> {
    let dest = resolve_link_target(link)?;
    let dest = dest.as_path();
    let label = dest.display().to_string();
    let expected = expected_sha256.unwrap_or(ABSENT_SENTINEL);
    check_unchanged(dest, expected, &label)?;

    let backup = match fs::read(dest) {
        Ok(old) => {
            let home = backup_home()?;
            let relative = backup_relative(link, &home);
            let stamp = chrono::Utc::now().format("%Y%m%dT%H%M%S%3fZ").to_string();
            let mut slot = stamp.clone();
            let mut n = 1;
            let (backup, backup_relative_path) = loop {
                let rel = format!("{USER_BACKUPS_DIR}/{slot}/{relative}");
                let path = home.join(&rel);
                if fs::symlink_metadata(&path).is_err() {
                    break (path, rel);
                }
                slot = format!("{stamp}-{n}");
                n += 1;
            };
            write_atomically(&backup, &old, None, &backup_relative_path, sync_directory)
                .or_else(settled_on_disk)
                .map_err(|e| format!("Failed to back up {}: {}", label, e))?;
            Some(backup)
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => None,
        Err(e) => return Err(format!("Failed to read {}: {}", label, e)),
    };

    write_atomically(dest, content.as_bytes(), Some(expected), &label, sync_directory)
        .or_else(settled_on_disk)?;
    Ok(backup)
}

/// Follow `path` through any chain of symlinks to the path it finally names,
/// which may not exist (a dangling link). Only the final component is
/// resolved; parent directories are left to the OS. A relative link target is
/// taken relative to the directory holding the link.
pub(crate) fn resolve_link_target(path: &Path) -> Result<PathBuf, String> {
    let mut current = path.to_path_buf();
    for _ in 0..40 {
        match fs::symlink_metadata(&current) {
            Ok(meta) if meta.file_type().is_symlink() => {
                let target = fs::read_link(&current)
                    .map_err(|e| format!("Failed to read link {}: {}", current.display(), e))?;
                current = if target.is_absolute() {
                    target
                } else {
                    current.parent().unwrap_or_else(|| Path::new("")).join(target)
                };
            }
            _ => return Ok(current),
        }
    }
    Err(format!("{} has too many levels of symbolic links", path.display()))
}

/// The digest a save of the user file at `path` will check against
/// ([`write_user_file`]): the digest of the file the path finally names, or
/// the absent sentinel when there is none.
pub(crate) fn user_file_digest(path: &Path) -> Result<String, String> {
    current_digest(&resolve_link_target(path)?)
}

/// A rename that landed but whose directory fsync failed still wrote the file.
fn settled_on_disk(failure: WriteFailure) -> Result<(), String> {
    match failure {
        WriteFailure::Unchanged(message) => Err(message),
        WriteFailure::ReplacedNotDurable(_) => Ok(()),
    }
}

fn refuse_read_only(dest: &Path, relative: &str) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if !is_state_path(relative) {
            if let Ok(meta) = fs::symlink_metadata(dest) {
                if meta.is_file() && meta.permissions().mode() & 0o200 == 0 {
                    return Err(format!(
                        "Refusing to write '{}': the file is read-only",
                        relative
                    ));
                }
            }
        }
    }
    #[cfg(not(unix))]
    let _ = (dest, relative);
    Ok(())
}

/// Create `dir` and any missing ancestors; when `private`, the ones this call
/// creates are 0700. Existing directories are left as they are.
fn create_parent_dirs(dir: &Path, private: bool) -> std::io::Result<()> {
    let mut builder = fs::DirBuilder::new();
    builder.recursive(true);
    #[cfg(unix)]
    if private {
        use std::os::unix::fs::DirBuilderExt;
        builder.mode(0o700);
    }
    #[cfg(not(unix))]
    let _ = private;
    builder.create(dir)
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
    fn rejects_empty_and_dot_segments() {
        // Each would put the temp file's parent above the declared directory.
        assert!(!is_declared_store(".claude/skills/."));
        assert!(!is_declared_store(".claude/./skills/review/SKILL.md"));
        assert!(!is_declared_store(".harness/"));
        assert!(!is_declared_store(".harness//backups/x.json"));
        assert!(!is_declared_store(".claude/skills/review/"));
        // The plain forms stay accepted.
        assert!(is_declared_store(".claude/skills/review/SKILL.md"));
        assert!(is_declared_store(".harness/backups/x.json"));
    }

    #[test]
    fn accepts_harness_own_state_directory() {
        // Backups and manifests must be writable or nothing is rollback-able.
        assert!(is_declared_store(".harness/backups/2026-09-01/transaction.json"));
        assert!(!is_declared_store(".harness/../.ssh/id_rsa"));
    }

    #[test]
    fn rejects_the_rest_of_the_state_directory() {
        // Only backups/ is in scope. harness.db, harness.yaml, device.json and
        // exchange/identity.key are written by their own Rust commands, never
        // through this one, and must stay unreachable from the webview.
        assert!(!is_declared_store(".harness/harness.db"));
        assert!(!is_declared_store(".harness/harness.yaml"));
        assert!(!is_declared_store(".harness/device.json"));
        assert!(!is_declared_store(".harness/exchange/identity.key"));
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

    #[test]
    fn a_directory_shaped_path_is_refused_not_written_as_a_file() {
        let home = tempfile::TempDir::new().unwrap();
        for path in [
            ".claude/skills/",
            ".harness/backups/",
            ".harness/backups/.",
            ".claude//skills/x",
            ".claude/./skills/x",
            ".harness/backups//x",
            ".harness/backups/./x",
            ".harness/backups/a/./b",
            ".claude.json/",
            ".claude/skills/x\0y",
        ] {
            assert!(!is_declared_store(path), "{} should be rejected", path);
            assert!(apply_surface_transaction_in(home.path(), vec![write_plain(path)]).is_err());
        }
        assert!(fs::read_dir(home.path()).unwrap().next().is_none());
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

    fn write_plain(relative: &str) -> SurfaceFileWrite {
        write(relative, "x")
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

        let failure = write_atomically(
            &store,
            b"{}",
            Some(&sha256_hex(b"{}")),
            ".claude.json",
            sync_directory,
        )
        .unwrap_err();
        let WriteFailure::Unchanged(err) = failure else {
            panic!("expected Unchanged, got {:?}", failure);
        };
        assert!(err.contains("changed on disk since it was read"), "got: {}", err);
        assert_eq!(fs::read_to_string(&store).unwrap(), "{\"moved\":true}");
        assert!(temp_files_in(home.path()).is_empty());
    }

    // ── Precondition digest: the text the webview reads ───────────────

    /// Shared with the McpServersPage tests, which check the webview sends
    /// the same digest for the same bytes.
    const DIGEST_FIXTURE: &str =
        include_str!("../../../src/lib/__tests__/fixtures/precondition-digest.json");

    struct DigestCase {
        name: String,
        bytes: Vec<u8>,
        text: String,
        sha256: String,
    }

    fn digest_cases() -> Vec<DigestCase> {
        let fixture: serde_json::Value = serde_json::from_str(DIGEST_FIXTURE).unwrap();
        fixture["cases"]
            .as_array()
            .unwrap()
            .iter()
            .map(|case| {
                let hex = case["bytesHex"].as_str().unwrap();
                DigestCase {
                    name: case["name"].as_str().unwrap().to_string(),
                    bytes: (0..hex.len())
                        .step_by(2)
                        .map(|i| u8::from_str_radix(&hex[i..i + 2], 16).unwrap())
                        .collect(),
                    text: case["text"].as_str().unwrap().to_string(),
                    sha256: case["sha256"].as_str().unwrap().to_string(),
                }
            })
            .collect()
    }

    fn digest_case(name: &str) -> DigestCase {
        digest_cases().into_iter().find(|case| case.name == name).unwrap()
    }

    #[test]
    fn the_digest_is_over_the_text_a_textdecoder_would_produce() {
        // Each fixture's `text` is what WHATWG TextDecoder("utf-8") returns
        // for its bytes: BOM dropped, one U+FFFD per maximal invalid subpart
        // (invalid bytes, a truncated sequence mid-file and at end of file,
        // encoded surrogates, overlong forms).
        let cases = digest_cases();
        assert!(cases.len() >= 5);
        for case in cases {
            let body = case.bytes.strip_prefix(b"\xEF\xBB\xBF").unwrap_or(&case.bytes);
            assert_eq!(String::from_utf8_lossy(body), case.text, "decode of {}", case.name);
            assert_eq!(sha256_hex(case.text.as_bytes()), case.sha256, "fixture {}", case.name);
            assert_eq!(precondition_digest(&case.bytes), case.sha256, "digest of {}", case.name);
        }
    }

    #[test]
    fn a_bom_prefixed_file_saves_against_the_webview_digest() {
        let home = TempDir::new().unwrap();
        let store = home.path().join(".claude.json");
        let case = digest_case("bom");
        fs::write(&store, &case.bytes).unwrap();

        apply_surface_transaction_in(
            home.path(),
            vec![write_expecting(".claude.json", "{\"mcpServers\":{\"a\":{}}}\n", &case.sha256)],
        )
        .unwrap();
        // Written exactly as given: the BOM is not carried over.
        assert_eq!(fs::read(&store).unwrap(), b"{\"mcpServers\":{\"a\":{}}}\n");
    }

    #[test]
    fn an_invalid_utf8_file_saves_against_the_webview_digest() {
        let home = TempDir::new().unwrap();
        let store = home.path().join(".claude.json");
        let case = digest_case("invalid-utf8");
        fs::write(&store, &case.bytes).unwrap();

        apply_surface_transaction_in(
            home.path(),
            vec![write_expecting(".claude.json", "{}\n", &case.sha256)],
        )
        .unwrap();
        assert_eq!(fs::read_to_string(&store).unwrap(), "{}\n");
    }

    #[test]
    fn a_real_change_to_a_bom_file_still_refuses() {
        let home = TempDir::new().unwrap();
        let store = home.path().join(".claude.json");
        let case = digest_case("bom");
        // Same BOM, different text after it.
        let mut changed = case.bytes.clone();
        changed.extend_from_slice(b" ");
        fs::write(&store, &changed).unwrap();

        let err = apply_surface_transaction_in(
            home.path(),
            vec![write_expecting(".claude.json", "{}\n", &case.sha256)],
        )
        .unwrap_err();
        assert!(err.contains("changed on disk since it was read"), "got: {}", err);
        assert_eq!(fs::read(&store).unwrap(), changed);
    }

    #[test]
    fn a_digest_of_the_raw_bom_bytes_no_longer_matches() {
        // The precondition is defined on the decoded text, so the raw-byte
        // hash of a BOM file is a different (stale) value.
        let home = TempDir::new().unwrap();
        let store = home.path().join(".claude.json");
        let case = digest_case("bom");
        fs::write(&store, &case.bytes).unwrap();

        let err = apply_surface_transaction_in(
            home.path(),
            vec![write_expecting(".claude.json", "{}\n", &sha256_hex(&case.bytes))],
        )
        .unwrap_err();
        assert!(err.contains("changed on disk since it was read"), "got: {}", err);
    }

    #[test]
    fn absent_still_refuses_an_empty_or_bom_only_file() {
        // An existing file never digests to "absent", however little it holds.
        for bytes in [&b""[..], &b"\xEF\xBB\xBF"[..]] {
            let home = TempDir::new().unwrap();
            let store = home.path().join(".claude.json");
            fs::write(&store, bytes).unwrap();
            let err = apply_surface_transaction_in(
                home.path(),
                vec![write_expecting(".claude.json", "{}\n", ABSENT_SENTINEL)],
            )
            .unwrap_err();
            assert!(err.contains("changed on disk since it was read"), "got: {}", err);
            assert_eq!(fs::read(&store).unwrap(), bytes);
        }
    }

    // ── A failed directory fsync after the rename ─────────────────────

    fn failing_sync(_directory: &Path) -> std::io::Result<()> {
        Err(std::io::Error::other("injected fsync failure"))
    }

    #[test]
    fn a_failed_directory_sync_counts_the_file_as_written() {
        let home = TempDir::new().unwrap();
        let store = home.path().join(".claude.json");

        let err = apply_surface_transaction_with(
            home.path(),
            vec![write(".claude.json", "{}\n")],
            failing_sync,
        )
        .unwrap_err();

        // Replaced, and the error says so and lists it as written.
        assert_eq!(fs::read_to_string(&store).unwrap(), "{}\n");
        assert!(err.contains("was replaced, but syncing its directory failed"), "got: {}", err);
        assert!(err.contains("already written and not rolled back"), "got: {}", err);
        assert!(err.contains(".claude.json"), "got: {}", err);
        assert!(temp_files_in(home.path()).is_empty());
    }

    #[test]
    fn a_failed_directory_sync_mid_batch_lists_every_replaced_file_and_stops() {
        // The first file's sync failure stops the batch: the second file is
        // not attempted, and the first is named as written.
        let home = TempDir::new().unwrap();

        let err = apply_surface_transaction_with(
            home.path(),
            vec![write(".codex/config.toml", "x = 1\n"), write(".claude.json", "{}\n")],
            failing_sync,
        )
        .unwrap_err();

        assert!(err.contains("already written and not rolled back"), "got: {}", err);
        assert!(err.contains("config.toml"), "got: {}", err);
        assert_eq!(
            fs::read_to_string(home.path().join(".codex/config.toml")).unwrap(),
            "x = 1\n"
        );
        assert!(!home.path().join(".claude.json").exists());
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

    #[test]
    fn a_caller_supplied_temp_path_is_still_refused() {
        // A temp-shaped suffix on a declared store is not the store. (A path
        // BENEATH a declared directory is allowed whatever it is called, so
        // this says nothing about names inside skills directories.)
        let home = TempDir::new().unwrap();
        for path in [".claude.json.harness-tmp-2026-09-26-0", ".claude.json.hk-tmp-abc"] {
            let err = apply_surface_transaction_in(home.path(), vec![write(path, "x")]).unwrap_err();
            assert!(err.contains("not a config store"), "got: {}", err);
        }
        assert!(fs::read_dir(home.path()).unwrap().next().is_none());
    }

    #[test]
    fn a_backslash_path_is_written_where_it_was_validated() {
        let home = TempDir::new().unwrap();
        apply_surface_transaction_in(home.path(), vec![write(".claude\\skills\\x\\SKILL.md", "ok")])
            .unwrap();
        assert_eq!(
            fs::read_to_string(home.path().join(".claude/skills/x/SKILL.md")).unwrap(),
            "ok"
        );
        assert!(!home.path().join(".claude\\skills\\x\\SKILL.md").exists());
    }

    #[test]
    fn a_long_store_name_is_still_writable() {
        // The temp name must not grow with the destination's name.
        let home = TempDir::new().unwrap();
        let name = format!(".claude/skills/x/{}.md", "a".repeat(240));
        apply_surface_transaction_in(home.path(), vec![write(&name, "ok")]).unwrap();
        assert_eq!(fs::read_to_string(home.path().join(&name)).unwrap(), "ok");
    }

    #[cfg(unix)]
    #[test]
    fn a_read_only_store_is_refused_not_overridden() {
        use std::os::unix::fs::PermissionsExt;
        let home = TempDir::new().unwrap();
        let store = home.path().join(".claude.json");
        fs::write(&store, "locked").unwrap();
        fs::set_permissions(&store, fs::Permissions::from_mode(0o400)).unwrap();
        let err =
            apply_surface_transaction_in(home.path(), vec![write(".claude.json", "{}")]).unwrap_err();
        assert!(err.contains("read-only"), "got: {}", err);
        assert_eq!(fs::read_to_string(&store).unwrap(), "locked");
        assert!(temp_files_in(home.path()).is_empty());
    }

    #[cfg(unix)]
    #[test]
    fn backups_and_manifests_under_the_state_dir_are_0600_in_0700_dirs() {
        // A backup is a verbatim copy of ~/.claude.json, MCP env tokens
        // included. The engine asks for 0600 through setFileMode, which the
        // Tauri provider cannot do, so this command does it.
        let home = TempDir::new().unwrap();
        let backup = ".harness/backups/2026-09-26-app/.claude.json";
        let manifest = ".harness/backups/2026-09-26-app/transaction.json";
        apply_surface_transaction_in(
            home.path(),
            vec![write(backup, "{\"token\":\"secret\"}"), write(manifest, "{}")],
        )
        .unwrap();
        assert_eq!(mode_of(&home.path().join(backup)), 0o600);
        assert_eq!(mode_of(&home.path().join(manifest)), 0o600);
        for dir in [".harness", ".harness/backups", ".harness/backups/2026-09-26-app"] {
            assert_eq!(mode_of(&home.path().join(dir)), 0o700, "{} should be 0700", dir);
        }
    }

    #[cfg(unix)]
    #[test]
    fn a_rewritten_state_file_is_tightened_to_0600() {
        // The manifest is written twice (prepared, then committed); one left
        // 0644 by an older build must not stay that way.
        use std::os::unix::fs::PermissionsExt;
        let home = TempDir::new().unwrap();
        let manifest = home.path().join(".harness/backups/t/transaction.json");
        fs::create_dir_all(manifest.parent().unwrap()).unwrap();
        fs::write(&manifest, "{}").unwrap();
        fs::set_permissions(&manifest, fs::Permissions::from_mode(0o644)).unwrap();
        apply_surface_transaction_in(
            home.path(),
            vec![write(".harness/backups/t/transaction.json", "{\"status\":\"committed\"}")],
        )
        .unwrap();
        assert_eq!(mode_of(&manifest), 0o600);
    }

    #[cfg(unix)]
    #[test]
    fn a_symlinked_state_dir_is_refused() {
        let home = TempDir::new().unwrap();
        let outside = TempDir::new().unwrap();
        std::os::unix::fs::symlink(outside.path(), home.path().join(".harness")).unwrap();
        let err = apply_surface_transaction_in(
            home.path(),
            vec![write(".harness/backups/t/transaction.json", "{}")],
        )
        .unwrap_err();
        assert!(err.contains("symbolic link"), "got: {}", err);
        assert!(fs::read_dir(outside.path()).unwrap().next().is_none());
    }

    #[cfg(unix)]
    #[test]
    fn a_locked_file_anywhere_in_a_batch_writes_nothing_and_creates_no_directory() {
        use std::os::unix::fs::PermissionsExt;
        let home = TempDir::new().unwrap();
        let locked = home.path().join(".claude.json");
        fs::write(&locked, "locked").unwrap();
        fs::set_permissions(&locked, fs::Permissions::from_mode(0o400)).unwrap();

        let err = apply_surface_transaction_in(
            home.path(),
            vec![write(".codex/config.toml", "x = 1\n"), write(".claude.json", "{}")],
        )
        .unwrap_err();
        assert!(err.contains("read-only"), "got: {}", err);
        assert!(!home.path().join(".codex").exists(), "the good file must not be written");
    }

    #[cfg(unix)]
    #[test]
    fn a_locked_file_is_not_deleted_either() {
        use std::os::unix::fs::PermissionsExt;
        let home = TempDir::new().unwrap();
        let locked = home.path().join(".claude.json");
        fs::write(&locked, "locked").unwrap();
        fs::set_permissions(&locked, fs::Permissions::from_mode(0o400)).unwrap();
        let err = apply_surface_transaction_in(
            home.path(),
            vec![SurfaceFileWrite {
                relative_path: ".claude.json".to_string(),
                content: None,
                expected_sha256: None,
            }],
        )
        .unwrap_err();
        assert!(err.contains("read-only"), "got: {}", err);
        assert!(locked.exists());
    }

    #[cfg(unix)]
    #[test]
    fn a_precondition_on_a_non_regular_file_errors_instead_of_hanging() {
        // A FIFO at a store path would block fs::read forever; any non-regular
        // file must be refused before the read. A directory stands in for it
        // here, since creating a FIFO needs libc.
        let home = TempDir::new().unwrap();
        fs::create_dir(home.path().join(".claude.json")).unwrap();
        let err = apply_surface_transaction_in(
            home.path(),
            vec![write_expecting(".claude.json", "{}", ABSENT_SENTINEL)],
        )
        .unwrap_err();
        assert!(err.contains("not a regular file"), "got: {}", err);
    }
}

#[cfg(test)]
mod user_file_tests {
    use super::*;
    use tempfile::TempDir;

    fn siblings(dir: &Path) -> Vec<String> {
        let mut names: Vec<String> = fs::read_dir(dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        names.sort();
        names
    }

    #[test]
    fn matching_digest_writes_and_leaves_a_backup() {
        let dir = TempDir::new().unwrap();
        set_test_home(dir.path());
        let file = dir.path().join("a.md");
        fs::write(&file, "old").unwrap();
        let backup = write_user_file(&file, "new", Some(&loaded_text_digest("old")))
            .unwrap()
            .expect("a backup of the old content");
        assert_eq!(fs::read_to_string(&file).unwrap(), "new");
        assert_eq!(fs::read_to_string(backup).unwrap(), "old");
        assert_eq!(siblings(dir.path()), vec![".harness", "a.md"], "no backup or temp file beside the file");
    }

    #[cfg(unix)]
    #[test]
    fn backups_live_under_the_home_backups_dir_private_and_keyed_by_the_home_relative_path() {
        use std::os::unix::fs::PermissionsExt;
        let home = TempDir::new().unwrap();
        set_test_home(home.path());
        let file = home.path().join(".claude/nested/a.md");
        fs::create_dir_all(file.parent().unwrap()).unwrap();
        fs::write(&file, "old").unwrap();
        let backup = write_user_file(&file, "new", Some(&loaded_text_digest("old")))
            .unwrap()
            .unwrap();
        let rel = backup.strip_prefix(home.path().join(USER_BACKUPS_DIR)).unwrap();
        let parts: Vec<_> = rel.components().map(|c| c.as_os_str().to_string_lossy().into_owned()).collect();
        assert_eq!(parts.len(), 4, "<stamp>/.claude/nested/a.md, got {parts:?}");
        assert_eq!(parts[1..], [".claude", "nested", "a.md"]);
        let mode = |p: &Path| fs::metadata(p).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode(&backup), 0o600);
        assert_eq!(mode(backup.parent().unwrap()), 0o700, "created directories are private");
        assert_eq!(mode(backup.parent().unwrap().parent().unwrap().parent().unwrap()), 0o700);
        assert_eq!(siblings(file.parent().unwrap()), vec!["a.md"], "nothing beside the file");
        assert_eq!(user_backups(home.path()), vec![backup]);
    }

    #[test]
    fn two_backups_in_one_millisecond_both_survive() {
        let home = TempDir::new().unwrap();
        set_test_home(home.path());
        let file = home.path().join("a.md");
        fs::write(&file, "one").unwrap();
        write_user_file(&file, "two", Some(&loaded_text_digest("one"))).unwrap();
        write_user_file(&file, "three", Some(&loaded_text_digest("two"))).unwrap();
        let mut bodies: Vec<String> = user_backups(home.path())
            .iter()
            .map(|p| fs::read_to_string(p).unwrap())
            .collect();
        bodies.sort();
        assert_eq!(bodies, ["one", "two"]);
    }

    #[test]
    fn a_file_outside_the_home_directory_is_backed_up_under_the_home_not_beside_it() {
        let home = TempDir::new().unwrap();
        let elsewhere = TempDir::new().unwrap();
        set_test_home(home.path());
        let file = elsewhere.path().join("a.md");
        fs::write(&file, "old").unwrap();
        let backup = write_user_file(&file, "new", Some(&loaded_text_digest("old"))).unwrap().unwrap();
        assert!(backup.starts_with(home.path().join(USER_BACKUPS_DIR)), "{}", backup.display());
        assert!(backup.to_string_lossy().contains("_outside_home"));
        assert_eq!(siblings(elsewhere.path()), vec!["a.md"]);
    }

    #[test]
    fn mismatched_digest_refuses_and_changes_nothing() {
        let dir = TempDir::new().unwrap();
        let file = dir.path().join("a.md");
        fs::write(&file, "disk").unwrap();
        let err = write_user_file(&file, "new", Some(&loaded_text_digest("loaded"))).unwrap_err();
        assert!(err.contains("changed on disk"), "{}", err);
        assert_eq!(fs::read_to_string(&file).unwrap(), "disk");
        assert_eq!(siblings(dir.path()), vec!["a.md"]);
    }

    #[test]
    fn none_on_an_existing_file_refuses_and_none_on_a_missing_file_creates() {
        let dir = TempDir::new().unwrap();
        let file = dir.path().join("a.md");
        assert!(write_user_file(&file, "first", None).unwrap().is_none());
        assert_eq!(fs::read_to_string(&file).unwrap(), "first");
        let err = write_user_file(&file, "second", None).unwrap_err();
        assert!(err.contains("changed on disk"), "{}", err);
        assert_eq!(fs::read_to_string(&file).unwrap(), "first");
    }

    #[test]
    fn a_leading_bom_does_not_change_the_loaded_digest() {
        let dir = TempDir::new().unwrap();
        let file = dir.path().join("a.md");
        fs::write(&file, "\u{feff}old").unwrap();
        // The webview hashes the text with the BOM stripped.
        write_user_file(&file, "new", Some(&loaded_text_digest("old"))).unwrap();
        assert_eq!(fs::read_to_string(&file).unwrap(), "new");
    }

    #[cfg(unix)]
    #[test]
    fn replaces_the_file_through_a_temp_rename_not_in_place() {
        use std::os::unix::fs::MetadataExt;
        let dir = TempDir::new().unwrap();
        let file = dir.path().join("a.md");
        fs::write(&file, "old").unwrap();
        let before = fs::metadata(&file).unwrap().ino();
        write_user_file(&file, "new", Some(&loaded_text_digest("old"))).unwrap();
        assert_ne!(fs::metadata(&file).unwrap().ino(), before);
    }

    #[cfg(unix)]
    #[test]
    fn a_symlinked_destination_is_written_at_its_target_and_the_link_stays() {
        let dir = TempDir::new().unwrap();
        let repo = dir.path().join("dotfiles");
        let home = dir.path().join("home");
        fs::create_dir_all(&repo).unwrap();
        fs::create_dir_all(&home).unwrap();
        let target = repo.join("target.md");
        fs::write(&target, "t").unwrap();
        let link = home.join("link.md");
        std::os::unix::fs::symlink(&target, &link).unwrap();
        set_test_home(&home);

        let backup = write_user_file(&link, "x", Some(&loaded_text_digest("t")))
            .unwrap()
            .expect("a backup of the old content");

        assert!(fs::symlink_metadata(&link).unwrap().file_type().is_symlink(), "link was replaced");
        assert_eq!(fs::read_to_string(&target).unwrap(), "x");
        assert_eq!(fs::read_to_string(&link).unwrap(), "x");
        assert!(backup.starts_with(home.join(USER_BACKUPS_DIR)), "backup goes under the home backups dir");
        assert_eq!(backup.file_name().unwrap(), "link.md", "keyed by the link, not the target");
        assert_eq!(fs::read_to_string(backup).unwrap(), "t");
        assert_eq!(siblings(&repo), vec!["target.md"], "nothing lands in the dotfiles repo");
        assert_eq!(siblings(&home), vec![".harness", "link.md"], "nothing else lands beside the link");
    }

    #[cfg(unix)]
    #[test]
    fn a_relative_and_chained_symlink_resolves_to_the_final_target() {
        let dir = TempDir::new().unwrap();
        fs::create_dir_all(dir.path().join("real")).unwrap();
        fs::create_dir_all(dir.path().join("home")).unwrap();
        let target = dir.path().join("real/target.md");
        fs::write(&target, "t").unwrap();
        std::os::unix::fs::symlink("../real/target.md", dir.path().join("home/hop.md")).unwrap();
        std::os::unix::fs::symlink("hop.md", dir.path().join("home/link.md")).unwrap();
        write_user_file(&dir.path().join("home/link.md"), "x", Some(&loaded_text_digest("t"))).unwrap();
        assert_eq!(fs::read_to_string(&target).unwrap(), "x");
        assert!(fs::symlink_metadata(dir.path().join("home/link.md")).unwrap().file_type().is_symlink());
        assert!(fs::symlink_metadata(dir.path().join("home/hop.md")).unwrap().file_type().is_symlink());
    }

    #[cfg(unix)]
    #[test]
    fn a_symlinked_destination_still_checks_the_digest_at_the_target() {
        let dir = TempDir::new().unwrap();
        let target = dir.path().join("target.md");
        fs::write(&target, "disk").unwrap();
        let link = dir.path().join("link.md");
        std::os::unix::fs::symlink(&target, &link).unwrap();
        let err = write_user_file(&link, "x", Some(&loaded_text_digest("stale"))).unwrap_err();
        assert!(err.contains("changed on disk"), "{err}");
        assert_eq!(fs::read_to_string(&target).unwrap(), "disk");
        assert!(fs::symlink_metadata(&link).unwrap().file_type().is_symlink());
    }

    #[cfg(unix)]
    #[test]
    fn user_file_digest_follows_a_symlink() {
        let dir = TempDir::new().unwrap();
        let target = dir.path().join("target.md");
        fs::write(&target, "t").unwrap();
        let link = dir.path().join("link.md");
        std::os::unix::fs::symlink(&target, &link).unwrap();
        assert_eq!(user_file_digest(&link).unwrap(), loaded_text_digest("t"));
    }

    #[cfg(unix)]
    #[test]
    fn a_symlink_loop_is_refused() {
        let dir = TempDir::new().unwrap();
        let a = dir.path().join("a.md");
        let b = dir.path().join("b.md");
        std::os::unix::fs::symlink(&b, &a).unwrap();
        std::os::unix::fs::symlink(&a, &b).unwrap();
        let err = write_user_file(&a, "x", None).unwrap_err();
        assert!(err.contains("symbolic links"), "{err}");
    }

    #[cfg(unix)]
    #[test]
    fn replacing_a_file_keeps_its_mode() {
        use std::os::unix::fs::PermissionsExt;
        let dir = TempDir::new().unwrap();
        let file = dir.path().join("a.md");
        fs::write(&file, "old").unwrap();
        fs::set_permissions(&file, fs::Permissions::from_mode(0o640)).unwrap();
        write_user_file(&file, "new", Some(&loaded_text_digest("old"))).unwrap();
        assert_eq!(fs::metadata(&file).unwrap().permissions().mode() & 0o777, 0o640);
    }
}
