//! Guarded write, rename and remove for the webview's `TauriFsProvider`.
//!
//! The fs plugin's `write_text_file`, `rename` and `remove` are not granted to
//! the webview: a capability scope cannot say "no symlinks", "no recursive
//! delete" or "only the engine's temp files", and the webview is not trusted.
//! These three commands take their place and enforce their own limits.
//!
//! What each one accepts, after its paths are resolved natively:
//!
//! - `guarded_write_file` writes one `.harness-tmp-<suffix>` file, and only
//!   when that file is a temp sibling of a registry-declared config store under
//!   the home directory (`surface_write::is_declared_store`, which also covers
//!   the transaction engine's `.harness/backups/` subtree) or a temp sibling of
//!   a declared PROJECT store (`surface_write::is_declared_project_store`: the
//!   writable project-scope stores of the registry, generated into
//!   `write-scope.json`, plus the engine's project `.harness/backups/`) inside
//!   a project root the user picked in the native folder dialog
//!   (`fs_scope::granted_root_for`). It never writes the store itself.
//! - `guarded_rename_file` moves a regular file, and only a store's own
//!   `.harness-tmp-<suffix>` sibling onto that store (a home store, or a
//!   project store inside one granted root), so a file written under one store
//!   cannot be renamed onto another (`~/.claude.json` carries MCP commands) and
//!   a granted root is not a license to replace `foo.txt` or `.claude/settings.json`.
//! - `guarded_remove_file` deletes one regular file only when it is a
//!   `.harness-tmp-<suffix>` file of a declared store (home or project) or a
//!   file under `~/.harness/backups/` outside the quarantine. A declared home
//!   store or declared project store is not deleted: it is moved to
//!   `~/.harness/backups/quarantine/<UTC stamp>/<relative path>` (directories
//!   0700, file mode kept), which is how rollback removes a file it created.
//!   Anything else is refused.
//!
//! Three refusals apply to all three commands, whatever else matches: a path
//! with a `.git` component (any case) is refused, a path inside the quarantine
//! is never a write or rename target (a quarantined file is not deleted either;
//! removing it only moves it again), and a symlink source is refused.
//!
//! Symlinks are refused at the source (`symlink_metadata`, so a link is never
//! followed), directories are refused outright (no recursive removal exists
//! here), and every path must be absolute with no `.` or `..`. The parent
//! directory is canonicalized, so a symlinked ancestor that leaves the roots is
//! caught. The home-relative top directory (`~/.claude`) is canonicalized too,
//! so a `~/.claude` the user symlinked into a dotfiles repo still counts as
//! the declared location.

use std::fs;
use std::path::{Component, Path, PathBuf};

use super::fs_scope::granted_root_for;
use super::surface_write::{is_declared_project_store, is_declared_store};

/// Marker the transaction engine puts in the sibling file it renames over a
/// store (`<store>.harness-tmp-<suffix>`).
const TEMP_MARKER: &str = ".harness-tmp-";

/// Home-relative prefix of the engine's backups, the only non-temp files the
/// webview may delete.
const BACKUPS_PREFIX: &str = ".harness/backups/";

struct Roots<'a> {
    /// Canonical home directory.
    home: &'a Path,
    /// The outermost dialog-granted project root that contains a canonical
    /// path, if any.
    granted: &'a dyn Fn(&Path) -> Option<PathBuf>,
}

/// Absolute, `..`-free path whose parent exists, returned with the parent
/// canonicalized. The final component is not resolved: it may not exist yet
/// (a rename destination) and is inspected with `symlink_metadata` instead.
fn resolve(path: &str) -> Result<PathBuf, String> {
    let p = Path::new(path);
    if !p.is_absolute() {
        return Err(format!("{path}: path must be absolute"));
    }
    if p.components()
        .any(|c| matches!(c, Component::ParentDir | Component::CurDir))
    {
        return Err(format!("{path}: path must not contain '.' or '..'"));
    }
    let name = p
        .file_name()
        .ok_or_else(|| format!("{path}: path has no file name"))?;
    let parent = p
        .parent()
        .ok_or_else(|| format!("{path}: path has no parent"))?;
    let canonical_parent = parent
        .canonicalize()
        .map_err(|e| format!("{path}: parent directory is not accessible: {e}"))?;
    Ok(canonical_parent.join(name))
}

fn strip_temp_suffix(relative: &str) -> &str {
    let last_segment_start = relative.rfind('/').map_or(0, |i| i + 1);
    match relative[last_segment_start..].rfind(TEMP_MARKER) {
        Some(i) => &relative[..last_segment_start + i],
        None => relative,
    }
}

/// Whether the final component is an engine temp name (`<name>.harness-tmp-<x>`
/// with a non-empty name and suffix).
fn is_temp_name(path: &Path) -> bool {
    let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
        return false;
    };
    match name.rfind(TEMP_MARKER) {
        Some(i) => i > 0 && name.len() > i + TEMP_MARKER.len(),
        None => false,
    }
}

/// The home-relative path (with `/` separators) of `resolved`, as the
/// registry names it, or `None` when `original` is not under `home`.
///
/// `resolved` has a canonical parent, so with `~/.claude` symlinked into a
/// dotfiles repo it no longer starts with `home`. The home-relative top
/// directory is canonicalized and substituted back, so such a path compares by
/// the location the user and the registry mean. A path that leaves the top
/// directory through a deeper symlink does not start with the canonical top
/// and yields `None`.
fn store_relative(original: &str, resolved: &Path, home: &Path) -> Option<String> {
    let lexical = Path::new(original).strip_prefix(home).ok()?;
    let mut components = lexical.components();
    let top = components.next()?.as_os_str().to_str()?;
    if components.next().is_none() {
        // A direct child of home: the parent is home itself.
        return resolved
            .strip_prefix(home)
            .ok()
            .and_then(|r| r.to_str())
            .map(str::to_owned);
    }
    let canonical_top = home.join(top).canonicalize().ok()?;
    let rest = resolved.strip_prefix(&canonical_top).ok()?.to_str()?;
    Some(format!("{top}/{rest}"))
}

/// A declared store, or a declared store's temp sibling, by home-relative path.
fn declared_or_temp(relative: &str) -> bool {
    is_declared_store(strip_temp_suffix(relative))
}

/// Any `.git` path component, in any case (macOS volumes are case-insensitive,
/// so `.GIT/config` is the same file). A git directory runs code (`core.fsmonitor`,
/// hooks), so nothing under one is ever written, renamed onto or removed here.
fn has_git_component(path: &Path) -> bool {
    path.components().any(|c| {
        c.as_os_str()
            .to_str()
            .is_some_and(|name| name.eq_ignore_ascii_case(".git"))
    })
}

/// A path inside the quarantine, found by its resolved location or by its
/// home-relative name (a `~/.harness` that is itself a symlink).
fn is_quarantined(original: &str, resolved: &Path, roots: &Roots) -> bool {
    resolved.starts_with(roots.home.join(QUARANTINE_DIR))
        || store_relative(original, resolved, roots.home)
            .is_some_and(|rel| rel.starts_with(QUARANTINE_PREFIX))
}

/// The path of `resolved` below the granted root that holds it.
fn project_relative(resolved: &Path, roots: &Roots) -> Option<String> {
    let root = (roots.granted)(resolved)?;
    resolved.strip_prefix(root).ok()?.to_str().map(str::to_owned)
}

/// A project store the app compiles to (or the engine's project backups) by
/// root-relative path.
fn project_store(relative: &str) -> bool {
    is_declared_project_store(relative)
}

/// Writes and temp-file removal: the engine's temp file next to a declared
/// home store, or next to a declared project store inside a granted root. Never
/// under `.git`, never in the quarantine.
fn temp_in_roots(original: &str, resolved: &Path, roots: &Roots) -> bool {
    if !is_temp_name(resolved)
        || has_git_component(resolved)
        || is_quarantined(original, resolved, roots)
    {
        return false;
    }
    if let Some(rel) = project_relative(resolved, roots) {
        if project_store(strip_temp_suffix(&rel)) {
            return true;
        }
    }
    store_relative(original, resolved, roots.home).is_some_and(|rel| declared_or_temp(&rel))
}

/// A rename is allowed only when the source is the destination's own temp
/// sibling and the destination is a declared store: a home store, or a project
/// store inside the granted root that holds both ends. Never involving `.git`
/// or the quarantine.
fn rename_allowed(from: &str, source: &Path, to: &str, dest: &Path, roots: &Roots) -> bool {
    if !is_temp_name(source)
        || has_git_component(source)
        || has_git_component(dest)
        || is_quarantined(from, source, roots)
        || is_quarantined(to, dest, roots)
    {
        return false;
    }
    if let (Some(a), Some(b)) = ((roots.granted)(source), (roots.granted)(dest)) {
        if a == b {
            if let (Some(from_rel), Some(to_rel)) =
                (project_relative(source, roots), project_relative(dest, roots))
            {
                if project_store(&to_rel) && strip_temp_suffix(&from_rel) == to_rel {
                    return true;
                }
            }
        }
    }
    let (Some(from_rel), Some(to_rel)) = (
        store_relative(from, source, roots.home),
        store_relative(to, dest, roots.home),
    ) else {
        return false;
    };
    is_declared_store(&to_rel) && strip_temp_suffix(&from_rel) == to_rel
}

/// A removal is allowed for an engine temp file of a declared store, or a file
/// the engine keeps under `~/.harness/backups/` outside the quarantine and any
/// `.git` directory. Quarantined files are not deleted from the webview.
fn remove_allowed(original: &str, resolved: &Path, roots: &Roots) -> bool {
    if temp_in_roots(original, resolved, roots) {
        return true;
    }
    if has_git_component(resolved) {
        return false;
    }
    store_relative(original, resolved, roots.home).is_some_and(|rel| {
        rel.starts_with(BACKUPS_PREFIX)
            && !rel.starts_with(QUARANTINE_PREFIX)
            && is_declared_store(&rel)
    })
}

/// The source must be an existing regular file: not a symlink, not a directory.
fn require_regular_file(resolved: &Path, shown: &str) -> Result<(), String> {
    let meta = fs::symlink_metadata(resolved).map_err(|e| format!("{shown}: {e}"))?;
    if meta.file_type().is_symlink() {
        return Err(format!("{shown}: refusing to act on a symlink"));
    }
    if !meta.is_file() {
        return Err(format!("{shown}: refusing to act on a directory"));
    }
    Ok(())
}

fn guarded_write(path: &str, content: &str, roots: &Roots) -> Result<(), String> {
    let target = resolve(path)?;
    if !temp_in_roots(path, &target, roots) {
        return Err(format!(
            "{path}: the webview may only write the engine's {TEMP_MARKER}<suffix> files beside a declared config store (home, or a declared project store inside a project root); never under .git or in the quarantine"
        ));
    }
    match fs::symlink_metadata(&target) {
        Ok(existing) if existing.file_type().is_symlink() || existing.is_dir() => {
            return Err(format!("{path}: target is a symlink or directory"));
        }
        _ => {}
    }
    fs::write(&target, content).map_err(|e| format!("write {path}: {e}"))
}

fn guarded_rename(from: &str, to: &str, roots: &Roots) -> Result<(), String> {
    let source = resolve(from)?;
    let dest = resolve(to)?;
    if !rename_allowed(from, &source, to, &dest, roots) {
        return Err(format!(
            "{from} -> {to}: outside the moves this app may make (a temp file onto its own declared store)"
        ));
    }
    require_regular_file(&source, from)?;
    if let Ok(existing) = fs::symlink_metadata(&dest) {
        if existing.file_type().is_symlink() || existing.is_dir() {
            return Err(format!("{to}: destination is a symlink or directory"));
        }
    }
    fs::rename(&source, &dest).map_err(|e| format!("rename {from} -> {to}: {e}"))
}

/// Where a quarantined file goes, relative to the home directory.
const QUARANTINE_DIR: &str = ".harness/backups/quarantine";
const QUARANTINE_PREFIX: &str = ".harness/backups/quarantine/";

/// The path a file keeps below its quarantine stamp: root-relative for a
/// declared project store inside a granted root, home-relative for a declared
/// home store. `None` for anything else, and for anything under `.git`.
fn quarantine_relative(original: &str, resolved: &Path, roots: &Roots) -> Option<String> {
    if has_git_component(resolved) {
        return None;
    }
    if let Some(rel) = project_relative(resolved, roots).filter(|rel| project_store(rel)) {
        return Some(rel);
    }
    store_relative(original, resolved, roots.home).filter(|rel| is_declared_store(rel))
}

/// Move a regular file to `~/.harness/backups/quarantine/<UTC stamp>/<relative>`
/// instead of deleting it. Directories are created 0700; the file keeps its
/// mode. Rollback of a file the engine created has to remove it, and this keeps
/// the bytes recoverable if the webview asks for a store it should not lose.
fn quarantine(target: &Path, relative: &str, home: &Path) -> Result<(), String> {
    let stamp = chrono::Utc::now().format("%Y%m%dT%H%M%S%.3fZ").to_string();
    let base = home.join(QUARANTINE_DIR);
    let mut dest = base.join(&stamp).join(relative);
    let mut n = 1;
    while fs::symlink_metadata(&dest).is_ok() {
        dest = base.join(format!("{stamp}-{n}")).join(relative);
        n += 1;
    }
    let dir = dest.parent().ok_or("quarantine: no parent directory")?;
    make_private_dirs(dir)?;
    let real = dir.canonicalize().map_err(|e| format!("quarantine: {e}"))?;
    if !real.starts_with(home) {
        return Err("quarantine: directory resolves outside the home directory".to_string());
    }
    if fs::rename(target, &dest).is_err() {
        // Another volume (a project root): copy keeps the mode, then remove.
        fs::copy(target, &dest).map_err(|e| format!("quarantine copy: {e}"))?;
        fs::remove_file(target).map_err(|e| format!("quarantine remove: {e}"))?;
    }
    Ok(())
}

fn make_private_dirs(dir: &Path) -> Result<(), String> {
    let mut builder = fs::DirBuilder::new();
    builder.recursive(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::DirBuilderExt;
        builder.mode(0o700);
    }
    builder
        .create(dir)
        .map_err(|e| format!("quarantine: {}: {e}", dir.display()))
}

fn guarded_remove(path: &str, roots: &Roots) -> Result<(), String> {
    let target = resolve(path)?;
    if remove_allowed(path, &target, roots) {
        require_regular_file(&target, path)?;
        return fs::remove_file(&target).map_err(|e| format!("remove {path}: {e}"));
    }
    let Some(relative) = quarantine_relative(path, &target, roots) else {
        return Err(format!(
            "{path}: outside the roots this app may modify (only declared home and project stores can be removed, never under .git)"
        ));
    };
    require_regular_file(&target, path)?;
    quarantine(&target, &relative, roots.home)
}

fn home() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("Could not resolve home directory")?;
    Ok(home.canonicalize().unwrap_or(home))
}

/// Write one engine temp file (`<store>.harness-tmp-<suffix>`). Never a store.
#[tauri::command]
pub fn guarded_write_file(path: String, content: String) -> Result<(), String> {
    let home = home()?;
    guarded_write(&path, &content, &Roots { home: &home, granted: &granted_root_for })
}

/// Rename one regular file: a temp file onto its own declared store (home, or
/// a project store inside one granted root).
#[tauri::command]
pub fn guarded_rename_file(from: String, to: String) -> Result<(), String> {
    let home = home()?;
    guarded_rename(&from, &to, &Roots { home: &home, granted: &granted_root_for })
}

/// Remove one regular file: delete an engine temp file or a backup, move a
/// declared home or project store to quarantine. Never a directory, never
/// under `.git`.
#[tauri::command]
pub fn guarded_remove_file(path: String) -> Result<(), String> {
    let home = home()?;
    guarded_remove(&path, &Roots { home: &home, granted: &granted_root_for })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::unix::fs::symlink;
    use tempfile::TempDir;

    const STORE: &str = ".claude/skills/review/SKILL.md";
    /// A second declared store; a file written under `STORE`'s tree must not
    /// be renamed onto it.
    const OTHER_STORE: &str = ".claude.json";

    struct Fixture {
        _tmp: TempDir,
        home: PathBuf,
        project: PathBuf,
        outside: PathBuf,
    }

    fn fixture() -> Fixture {
        let tmp = tempfile::tempdir().unwrap();
        let base = tmp.path().canonicalize().unwrap();
        let home = base.join("home");
        let project = base.join("project");
        let outside = base.join("outside");
        for dir in [&home, &project, &outside] {
            fs::create_dir_all(dir).unwrap();
        }
        fs::create_dir_all(home.join(".claude/skills/review")).unwrap();
        Fixture { _tmp: tmp, home, project, outside }
    }

    impl Fixture {
        fn roots<'a>(&'a self, granted: &'a dyn Fn(&Path) -> Option<PathBuf>) -> Roots<'a> {
            Roots { home: &self.home, granted }
        }
        fn s(path: &Path) -> String {
            path.to_string_lossy().into_owned()
        }
        fn temp(&self, rel: &str) -> PathBuf {
            self.home.join(format!("{rel}{TEMP_MARKER}abc"))
        }
    }

    fn no_roots(_: &Path) -> Option<PathBuf> {
        None
    }

    fn root_at(root: &Path) -> impl Fn(&Path) -> Option<PathBuf> {
        let root = root.to_path_buf();
        move |p: &Path| p.starts_with(&root).then(|| root.clone())
    }

    fn project_granted(f: &Fixture) -> impl Fn(&Path) -> Option<PathBuf> {
        root_at(&f.project)
    }

    #[test]
    fn declared_other_store_is_really_declared() {
        assert!(is_declared_store(STORE));
        assert!(is_declared_store(OTHER_STORE));
    }

    #[test]
    fn rename_declared_store_temp_over_store() {
        let f = fixture();
        let store = f.home.join(STORE);
        let temp = f.temp(STORE);
        fs::write(&store, "old").unwrap();
        fs::write(&temp, "new").unwrap();
        guarded_rename(&Fixture::s(&temp), &Fixture::s(&store), &f.roots(&no_roots)).unwrap();
        assert_eq!(fs::read_to_string(&store).unwrap(), "new");
        assert!(!temp.exists());
    }

    #[test]
    fn rename_store_file_onto_another_store_refused() {
        let f = fixture();
        let source = f.home.join(STORE);
        let target = f.home.join(OTHER_STORE);
        fs::write(&source, "{\"mcpServers\":{\"x\":{\"command\":\"evil\"}}}").unwrap();
        fs::write(&target, "{}").unwrap();
        let err = guarded_rename(&Fixture::s(&source), &Fixture::s(&target), &f.roots(&no_roots))
            .unwrap_err();
        assert!(err.contains("outside the moves"), "{err}");
        assert_eq!(fs::read_to_string(&target).unwrap(), "{}");
        assert!(source.exists());
    }

    #[test]
    fn rename_temp_of_one_store_onto_another_store_refused() {
        let f = fixture();
        let temp = f.temp(STORE);
        let target = f.home.join(OTHER_STORE);
        fs::write(&temp, "evil").unwrap();
        fs::write(&target, "{}").unwrap();
        assert!(guarded_rename(&Fixture::s(&temp), &Fixture::s(&target), &f.roots(&no_roots)).is_err());
        assert_eq!(fs::read_to_string(&target).unwrap(), "{}");
        assert!(temp.exists());
    }

    #[test]
    fn rename_temp_onto_a_non_store_in_home_refused() {
        let f = fixture();
        let temp = f.temp(STORE);
        fs::write(&temp, "x").unwrap();
        let zshrc = f.home.join(".zshrc");
        assert!(guarded_rename(&Fixture::s(&temp), &Fixture::s(&zshrc), &f.roots(&no_roots)).is_err());
        assert!(!zshrc.exists());
    }

    #[test]
    fn rename_inside_granted_project_root() {
        let f = fixture();
        let temp = f.project.join(format!("AGENTS.md{TEMP_MARKER}1"));
        let store = f.project.join("AGENTS.md");
        fs::write(&store, "old").unwrap();
        fs::write(&temp, "new").unwrap();
        let granted = project_granted(&f);
        guarded_rename(&Fixture::s(&temp), &Fixture::s(&store), &f.roots(&granted)).unwrap();
        assert_eq!(fs::read_to_string(&store).unwrap(), "new");
        assert!(!temp.exists());
    }

    #[test]
    fn plain_move_inside_a_granted_root_refused() {
        let f = fixture();
        let a = f.project.join("a.txt");
        let b = f.project.join("b.txt");
        fs::write(&a, "x").unwrap();
        let granted = project_granted(&f);
        assert!(guarded_rename(&Fixture::s(&a), &Fixture::s(&b), &f.roots(&granted)).is_err());
        assert!(a.exists() && !b.exists());
    }

    #[test]
    fn rename_between_two_granted_roots_refused() {
        let f = fixture();
        let other_root = f.outside.clone();
        let project = f.project.clone();
        let granted = move |p: &Path| {
            [&project, &other_root]
                .into_iter()
                .find(|r| p.starts_with(r))
                .cloned()
        };
        let a = f.project.join("a.txt");
        let b = f.outside.join("a.txt");
        fs::write(&a, "x").unwrap();
        assert!(guarded_rename(&Fixture::s(&a), &Fixture::s(&b), &f.roots(&granted)).is_err());
        assert!(a.exists() && !b.exists());
    }

    #[test]
    fn rename_granted_root_file_onto_a_store_refused() {
        let f = fixture();
        let a = f.project.join("a.txt");
        fs::write(&a, "x").unwrap();
        let target = f.home.join(OTHER_STORE);
        fs::write(&target, "{}").unwrap();
        let granted = project_granted(&f);
        assert!(guarded_rename(&Fixture::s(&a), &Fixture::s(&target), &f.roots(&granted)).is_err());
        assert_eq!(fs::read_to_string(&target).unwrap(), "{}");
    }

    #[test]
    fn remove_declared_store_moves_it_to_quarantine() {
        use std::os::unix::fs::PermissionsExt;
        let f = fixture();
        let store = f.home.join(OTHER_STORE);
        fs::write(&store, "{\"keep\":true}").unwrap();
        fs::set_permissions(&store, fs::Permissions::from_mode(0o600)).unwrap();
        let nested = f.home.join(STORE);
        fs::write(&nested, "nested bytes").unwrap();
        for path in [&store, &nested] {
            guarded_remove(&Fixture::s(path), &f.roots(&no_roots)).unwrap();
            assert!(!path.exists(), "original is gone");
        }
        let quarantine = f.home.join(QUARANTINE_DIR);
        let files = walk(&quarantine);
        let find = |suffix: &str| files.iter().find(|p| p.ends_with(suffix)).unwrap().clone();
        let kept = find(OTHER_STORE);
        assert_eq!(fs::read_to_string(&kept).unwrap(), "{\"keep\":true}");
        assert_eq!(fs::metadata(&kept).unwrap().permissions().mode() & 0o777, 0o600);
        assert_eq!(fs::read_to_string(find(STORE)).unwrap(), "nested bytes");
        let stamp_dir = kept.parent().unwrap();
        assert_eq!(fs::metadata(stamp_dir).unwrap().permissions().mode() & 0o777, 0o700);
    }

    #[test]
    fn removing_a_quarantined_file_never_deletes_its_bytes() {
        let f = fixture();
        let store = f.home.join(OTHER_STORE);
        fs::write(&store, "precious").unwrap();
        guarded_remove(&Fixture::s(&store), &f.roots(&no_roots)).unwrap();
        let held = walk(&f.home.join(QUARANTINE_DIR)).pop().unwrap();
        let _ = guarded_remove(&Fixture::s(&held), &f.roots(&no_roots));
        let bodies: Vec<String> = walk(&f.home.join(QUARANTINE_DIR))
            .into_iter()
            .map(|p| fs::read_to_string(p).unwrap())
            .collect();
        assert_eq!(bodies, ["precious"], "the quarantined bytes survive a remove");
    }

    #[test]
    fn removing_the_same_store_twice_keeps_both_copies() {
        let f = fixture();
        let store = f.home.join(OTHER_STORE);
        for body in ["one", "two"] {
            fs::write(&store, body).unwrap();
            guarded_remove(&Fixture::s(&store), &f.roots(&no_roots)).unwrap();
        }
        let mut bodies: Vec<String> = Vec::new();
        for stamp in fs::read_dir(f.home.join(QUARANTINE_DIR)).unwrap() {
            let dir = stamp.unwrap().path();
            for entry in walk(&dir) {
                bodies.push(fs::read_to_string(entry).unwrap());
            }
        }
        bodies.sort();
        assert_eq!(bodies, ["one", "two"]);
    }

    fn walk(dir: &Path) -> Vec<PathBuf> {
        let mut out = Vec::new();
        for e in fs::read_dir(dir).unwrap() {
            let p = e.unwrap().path();
            if p.is_dir() { out.extend(walk(&p)) } else { out.push(p) }
        }
        out
    }

    #[test]
    fn remove_undeclared_directory_and_symlinked_store_still_refused() {
        let f = fixture();
        let dir = f.home.join(".claude/skills/review/sub");
        fs::create_dir_all(&dir).unwrap();
        assert!(guarded_remove(&Fixture::s(&dir), &f.roots(&no_roots)).is_err());
        assert!(dir.exists());
        let target = f.outside.join("t");
        fs::write(&target, "t").unwrap();
        let link = f.home.join(OTHER_STORE);
        symlink(&target, &link).unwrap();
        assert!(guarded_remove(&Fixture::s(&link), &f.roots(&no_roots)).is_err());
        assert!(fs::symlink_metadata(&link).is_ok() && target.exists());
    }

    #[test]
    fn remove_store_temp_and_backup() {
        let f = fixture();
        let temp = f.temp(STORE);
        fs::write(&temp, "x").unwrap();
        let backups = f.home.join(".harness/backups/2026-01-01");
        fs::create_dir_all(&backups).unwrap();
        let backup = backups.join("transaction.json");
        fs::write(&backup, "{}").unwrap();
        guarded_remove(&Fixture::s(&temp), &f.roots(&no_roots)).unwrap();
        guarded_remove(&Fixture::s(&backup), &f.roots(&no_roots)).unwrap();
        assert!(!temp.exists() && !backup.exists());
    }

    #[test]
    fn remove_in_granted_root_deletes_temp_files_and_quarantines_the_rest() {
        let f = fixture();
        let plain = f.project.join(".claude/skills/keep/SKILL.md");
        fs::create_dir_all(plain.parent().unwrap()).unwrap();
        let temp = f.project.join(format!("AGENTS.md{TEMP_MARKER}1"));
        fs::write(&plain, "precious").unwrap();
        fs::write(&temp, "x").unwrap();
        let granted = project_granted(&f);
        guarded_remove(&Fixture::s(&plain), &f.roots(&granted)).unwrap();
        assert!(!plain.exists());
        let stamp = fs::read_dir(f.home.join(QUARANTINE_DIR)).unwrap().next().unwrap().unwrap().path();
        assert_eq!(fs::read_to_string(stamp.join(".claude/skills/keep/SKILL.md")).unwrap(), "precious");
        guarded_remove(&Fixture::s(&temp), &f.roots(&granted)).unwrap();
        assert!(!temp.exists());
        assert_eq!(walk(&f.home.join(QUARANTINE_DIR)).len(), 1, "a temp file is deleted, not quarantined");
    }

    #[test]
    fn remove_outside_roots_refused() {
        let f = fixture();
        let victim = f.outside.join(format!("victim.txt{TEMP_MARKER}1"));
        fs::write(&victim, "x").unwrap();
        let granted = project_granted(&f);
        let err = guarded_remove(&Fixture::s(&victim), &f.roots(&granted)).unwrap_err();
        assert!(err.contains("outside the roots"), "{err}");
        assert!(victim.exists());
    }

    #[test]
    fn remove_undeclared_home_file_refused() {
        let f = fixture();
        let zshrc = f.home.join(".zshrc");
        fs::write(&zshrc, "x").unwrap();
        assert!(guarded_remove(&Fixture::s(&zshrc), &f.roots(&no_roots)).is_err());
        assert!(zshrc.exists());
    }

    #[test]
    fn write_store_temp_ok_and_the_store_itself_refused() {
        let f = fixture();
        let temp = f.temp(STORE);
        guarded_write(&Fixture::s(&temp), "new", &f.roots(&no_roots)).unwrap();
        assert_eq!(fs::read_to_string(&temp).unwrap(), "new");

        let store = f.home.join(OTHER_STORE);
        fs::write(&store, "{}").unwrap();
        let err = guarded_write(&Fixture::s(&store), "evil", &f.roots(&no_roots)).unwrap_err();
        assert!(err.contains("may only write"), "{err}");
        assert_eq!(fs::read_to_string(&store).unwrap(), "{}");
    }

    #[test]
    fn write_temp_of_an_undeclared_name_refused() {
        let f = fixture();
        let temp = f.home.join(format!(".zshrc{TEMP_MARKER}1"));
        assert!(guarded_write(&Fixture::s(&temp), "x", &f.roots(&no_roots)).is_err());
        assert!(!temp.exists());
        // The bare name of a store is never writable, declared or not.
        let bare = f.home.join(".claude/settings.json");
        assert!(guarded_write(&Fixture::s(&bare), "x", &f.roots(&no_roots)).is_err());
        assert!(!bare.exists());
    }

    #[test]
    fn write_inside_granted_root_only_temp_files() {
        let f = fixture();
        let granted = project_granted(&f);
        let temp = f.project.join(format!("AGENTS.md{TEMP_MARKER}1"));
        guarded_write(&Fixture::s(&temp), "x", &f.roots(&granted)).unwrap();
        assert!(temp.exists());
        let plain = f.project.join("AGENTS.md");
        assert!(guarded_write(&Fixture::s(&plain), "x", &f.roots(&granted)).is_err());
        assert!(!plain.exists());
        let elsewhere = f.outside.join(format!("a.txt{TEMP_MARKER}1"));
        assert!(guarded_write(&Fixture::s(&elsewhere), "x", &f.roots(&granted)).is_err());
        assert!(!elsewhere.exists());
    }

    #[test]
    fn write_through_a_symlinked_temp_refused() {
        let f = fixture();
        let target = f.outside.join("secret.txt");
        fs::write(&target, "secret").unwrap();
        let temp = f.temp(STORE);
        symlink(&target, &temp).unwrap();
        assert!(guarded_write(&Fixture::s(&temp), "evil", &f.roots(&no_roots)).is_err());
        assert_eq!(fs::read_to_string(&target).unwrap(), "secret");
    }

    #[test]
    fn symlinked_claude_dir_still_accepts_store_rename_and_write() {
        let tmp = tempfile::tempdir().unwrap();
        let base = tmp.path().canonicalize().unwrap();
        let home = base.join("home");
        let dotfiles = base.join("dotfiles/claude");
        fs::create_dir_all(&home).unwrap();
        fs::create_dir_all(dotfiles.join("skills/review")).unwrap();
        symlink(&dotfiles, home.join(".claude")).unwrap();
        let roots = Roots { home: &home, granted: &no_roots };

        let store = home.join(STORE);
        let temp = home.join(format!("{STORE}{TEMP_MARKER}abc"));
        fs::write(dotfiles.join("skills/review/SKILL.md"), "old").unwrap();
        guarded_write(&Fixture::s(&temp), "new", &roots).unwrap();
        guarded_rename(&Fixture::s(&temp), &Fixture::s(&store), &roots).unwrap();
        assert_eq!(fs::read_to_string(dotfiles.join("skills/review/SKILL.md")).unwrap(), "new");
    }

    #[test]
    fn symlinked_subdirectory_leaving_the_top_dir_refused() {
        let f = fixture();
        fs::remove_dir_all(f.home.join(".claude/skills/review")).unwrap();
        symlink(&f.outside, f.home.join(".claude/skills/review")).unwrap();
        let temp = f.temp(STORE);
        assert!(guarded_write(&Fixture::s(&temp), "x", &f.roots(&no_roots)).is_err());
        assert!(!f.outside.join("SKILL.md.harness-tmp-abc").exists());
    }

    #[test]
    fn rename_destination_outside_roots_refused() {
        let f = fixture();
        let a = f.project.join("a.txt");
        fs::write(&a, "x").unwrap();
        let dest = f.outside.join("a.txt");
        let granted = project_granted(&f);
        assert!(guarded_rename(&Fixture::s(&a), &Fixture::s(&dest), &f.roots(&granted)).is_err());
        assert!(a.exists() && !dest.exists());
    }

    #[test]
    fn dotdot_escape_refused() {
        let f = fixture();
        let victim = f.outside.join(format!("victim.txt{TEMP_MARKER}1"));
        fs::write(&victim, "x").unwrap();
        let escape = format!("{}/../outside/victim.txt{TEMP_MARKER}1", Fixture::s(&f.project));
        let granted = project_granted(&f);
        let err = guarded_remove(&escape, &f.roots(&granted)).unwrap_err();
        assert!(err.contains("'..'"), "{err}");
        assert!(victim.exists());
    }

    #[test]
    fn relative_path_refused() {
        let f = fixture();
        let granted = project_granted(&f);
        assert!(guarded_remove("a.txt", &f.roots(&granted)).is_err());
    }

    #[test]
    fn symlinked_ancestor_leaving_roots_refused() {
        let f = fixture();
        let victim = f.outside.join(format!("victim.txt{TEMP_MARKER}1"));
        fs::write(&victim, "x").unwrap();
        let link = f.project.join("link");
        symlink(&f.outside, &link).unwrap();
        let through = link.join(format!("victim.txt{TEMP_MARKER}1"));
        let granted = project_granted(&f);
        assert!(guarded_remove(&Fixture::s(&through), &f.roots(&granted)).is_err());
        assert!(victim.exists());
    }

    #[test]
    fn symlink_source_refused_and_link_untouched() {
        let f = fixture();
        let target = f.outside.join("secret.txt");
        fs::write(&target, "secret").unwrap();
        let link = f.project.join(format!("AGENTS.md{TEMP_MARKER}1"));
        symlink(&target, &link).unwrap();
        let granted = project_granted(&f);
        let dest = f.project.join("AGENTS.md");
        let err = guarded_rename(&Fixture::s(&link), &Fixture::s(&dest), &f.roots(&granted))
            .unwrap_err();
        assert!(err.contains("symlink"), "{err}");
        let err = guarded_remove(&Fixture::s(&link), &f.roots(&granted)).unwrap_err();
        assert!(err.contains("symlink"), "{err}");
        assert!(fs::symlink_metadata(&link).is_ok());
        assert!(target.exists() && !dest.exists());
    }

    #[test]
    fn directory_remove_refused() {
        let f = fixture();
        let dir = f.project.join(format!("AGENTS.md{TEMP_MARKER}1"));
        fs::create_dir_all(dir.join("nested")).unwrap();
        fs::write(dir.join("nested/file.txt"), "x").unwrap();
        let granted = project_granted(&f);
        let err = guarded_remove(&Fixture::s(&dir), &f.roots(&granted)).unwrap_err();
        assert!(err.contains("directory"), "{err}");
        assert!(dir.join("nested/file.txt").exists());
    }

    #[test]
    fn directory_rename_refused() {
        let f = fixture();
        let dir = f.project.join("tree");
        fs::create_dir_all(&dir).unwrap();
        let granted = project_granted(&f);
        let dest = f.project.join("tree2");
        assert!(guarded_rename(&Fixture::s(&dir), &Fixture::s(&dest), &f.roots(&granted)).is_err());
        assert!(dir.exists());
    }

    fn ptemp(f: &Fixture, rel: &str) -> PathBuf {
        let path = f.project.join(format!("{rel}{TEMP_MARKER}1"));
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        path
    }

    #[test]
    fn project_git_config_write_rename_and_remove_refused() {
        let f = fixture();
        let granted = project_granted(&f);
        let config = f.project.join(".git/config");
        fs::create_dir_all(config.parent().unwrap()).unwrap();
        fs::write(&config, "[core]\n").unwrap();
        let temp = ptemp(&f, ".git/config");
        let err = guarded_write(&Fixture::s(&temp), "[core]\nfsmonitor = evil", &f.roots(&granted)).unwrap_err();
        assert!(err.contains("may only write"), "{err}");
        assert!(!temp.exists());
        // Even a temp file that got there another way cannot be renamed onto it.
        fs::write(&temp, "[core]\nfsmonitor = evil").unwrap();
        assert!(guarded_rename(&Fixture::s(&temp), &Fixture::s(&config), &f.roots(&granted)).is_err());
        assert!(guarded_remove(&Fixture::s(&temp), &f.roots(&granted)).is_err());
        assert!(guarded_remove(&Fixture::s(&config), &f.roots(&granted)).is_err());
        assert_eq!(fs::read_to_string(&config).unwrap(), "[core]\n");
        assert!(temp.exists());
    }

    #[test]
    fn git_component_refused_even_under_a_declared_directory_in_home_and_project() {
        let f = fixture();
        let granted = project_granted(&f);
        let home_temp = f.home.join(format!(".claude/skills/review/.git/hooks/pre-commit{TEMP_MARKER}1"));
        fs::create_dir_all(home_temp.parent().unwrap()).unwrap();
        assert!(guarded_write(&Fixture::s(&home_temp), "x", &f.roots(&no_roots)).is_err());
        let proj_temp = ptemp(&f, ".claude/skills/x/.GIT/config");
        assert!(guarded_write(&Fixture::s(&proj_temp), "x", &f.roots(&granted)).is_err());
        assert!(!home_temp.exists() && !proj_temp.exists());
    }

    #[test]
    fn arbitrary_project_file_write_rename_and_remove_refused() {
        let f = fixture();
        let granted = project_granted(&f);
        let temp = ptemp(&f, "foo.txt");
        assert!(guarded_write(&Fixture::s(&temp), "x", &f.roots(&granted)).is_err());
        assert!(!temp.exists());
        fs::write(&temp, "x").unwrap();
        let dest = f.project.join("foo.txt");
        assert!(guarded_rename(&Fixture::s(&temp), &Fixture::s(&dest), &f.roots(&granted)).is_err());
        assert!(!dest.exists());
        assert!(guarded_remove(&Fixture::s(&temp), &f.roots(&granted)).is_err());
        assert!(temp.exists());
        fs::write(&dest, "keep").unwrap();
        assert!(guarded_remove(&Fixture::s(&dest), &f.roots(&granted)).is_err());
        assert_eq!(fs::read_to_string(&dest).unwrap(), "keep");
        // The project's own hooks file is not a store the app compiles to.
        let settings = ptemp(&f, ".claude/settings.json");
        assert!(guarded_write(&Fixture::s(&settings), "x", &f.roots(&granted)).is_err());
    }

    #[test]
    fn declared_project_outputs_write_then_rename_onto_their_own_store_only() {
        let f = fixture();
        let granted = project_granted(&f);
        for rel in ["AGENTS.md", ".mcp.json", ".claude/skills/review/SKILL.md"] {
            let temp = ptemp(&f, rel);
            let store = f.project.join(rel);
            guarded_write(&Fixture::s(&temp), "new", &f.roots(&granted)).unwrap();
            guarded_rename(&Fixture::s(&temp), &Fixture::s(&store), &f.roots(&granted)).unwrap();
            assert_eq!(fs::read_to_string(&store).unwrap(), "new", "{rel}");
        }
        // One store's temp cannot land on another store.
        let temp = ptemp(&f, "AGENTS.md");
        fs::write(&temp, "evil").unwrap();
        let mcp = f.project.join(".mcp.json");
        assert!(guarded_rename(&Fixture::s(&temp), &Fixture::s(&mcp), &f.roots(&granted)).is_err());
        assert_eq!(fs::read_to_string(&mcp).unwrap(), "new");
    }

    #[test]
    fn project_engine_backups_and_manifest_temp_files_are_writable() {
        let f = fixture();
        let granted = project_granted(&f);
        let temp = ptemp(&f, ".harness/backups/20260101/transaction.json");
        let manifest = f.project.join(".harness/backups/20260101/transaction.json");
        guarded_write(&Fixture::s(&temp), "{}", &f.roots(&granted)).unwrap();
        guarded_rename(&Fixture::s(&temp), &Fixture::s(&manifest), &f.roots(&granted)).unwrap();
        assert_eq!(fs::read_to_string(&manifest).unwrap(), "{}");
    }

    #[test]
    fn writing_or_renaming_over_a_quarantined_file_never_changes_its_bytes() {
        let f = fixture();
        let store = f.home.join(OTHER_STORE);
        fs::write(&store, "precious").unwrap();
        guarded_remove(&Fixture::s(&store), &f.roots(&no_roots)).unwrap();
        let held = walk(&f.home.join(QUARANTINE_DIR)).pop().unwrap();
        let held_s = Fixture::s(&held);
        let temp = PathBuf::from(format!("{held_s}{TEMP_MARKER}1"));
        // Write a temp beside the quarantined file, then rename it over it.
        let _ = guarded_write(&Fixture::s(&temp), "evil", &f.roots(&no_roots));
        fs::write(&temp, "evil").unwrap();
        assert!(guarded_rename(&Fixture::s(&temp), &held_s, &f.roots(&no_roots)).is_err());
        assert!(guarded_write(&held_s, "evil", &f.roots(&no_roots)).is_err());
        // The same through a granted root that happens to contain the quarantine.
        let granted = root_at(&f.home.join(QUARANTINE_DIR));
        assert!(guarded_write(&Fixture::s(&temp), "evil", &f.roots(&granted)).is_err());
        assert!(guarded_rename(&Fixture::s(&temp), &held_s, &f.roots(&granted)).is_err());
        assert_eq!(fs::read_to_string(&held).unwrap(), "precious");
    }

    #[test]
    fn temp_suffix_only_stripped_from_last_segment() {
        assert_eq!(strip_temp_suffix(".claude.json.harness-tmp-9"), ".claude.json");
        assert_eq!(
            strip_temp_suffix(".claude/skills/x.harness-tmp-1/y.md"),
            ".claude/skills/x.harness-tmp-1/y.md"
        );
        let f = fixture();
        let sneaky = f.home.join(".ssh/id_rsa.harness-tmp-1");
        fs::create_dir_all(sneaky.parent().unwrap()).unwrap();
        fs::write(&sneaky, "x").unwrap();
        assert!(guarded_remove(&Fixture::s(&sneaky), &f.roots(&no_roots)).is_err());
    }
}
