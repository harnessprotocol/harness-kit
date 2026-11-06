//! Guarded rename and remove for the webview's `TauriFsProvider`.
//!
//! The fs plugin's `rename` and `remove` are not granted to the webview: a
//! capability scope cannot say "no symlinks" or "no recursive delete", and
//! the webview is not trusted. These two commands take their place. Each
//! resolves its paths natively and refuses anything that is not
//!
//! - inside a project root the user picked in the native folder dialog
//!   (`fs_scope::is_granted_root`), or
//! - a registry-declared config store under the home directory
//!   (`surface_write::is_declared_store`, which also covers the transaction
//!   engine's `.harness/backups/` subtree), optionally with the engine's
//!   `.harness-tmp-<suffix>` temp-file suffix.
//!
//! Symlinks are refused at the source (`symlink_metadata`, so a link is never
//! followed), directories are refused outright (no recursive removal exists
//! here), and every path must be absolute with no `..`. The parent directory
//! is canonicalized before the root check, so a symlinked ancestor that leaves
//! the roots is caught.

use std::fs;
use std::path::{Component, Path, PathBuf};

use super::fs_scope::is_granted_root;
use super::surface_write::is_declared_store;

/// Suffix the transaction engine gives the sibling file it renames over a
/// store (`<store>.harness-tmp-<suffix>`).
const TEMP_MARKER: &str = ".harness-tmp-";

struct Roots<'a> {
    /// Canonical home directory.
    home: &'a Path,
    /// Whether a canonical path lies inside a dialog-granted project root.
    granted: &'a dyn Fn(&Path) -> bool,
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

fn in_roots(resolved: &Path, roots: &Roots) -> bool {
    if (roots.granted)(resolved) {
        return true;
    }
    let Ok(relative) = resolved.strip_prefix(roots.home) else {
        return false;
    };
    let Some(relative) = relative.to_str() else {
        return false;
    };
    is_declared_store(strip_temp_suffix(relative))
}

fn checked(path: &str, roots: &Roots) -> Result<PathBuf, String> {
    let resolved = resolve(path)?;
    if !in_roots(&resolved, roots) {
        return Err(format!("{path}: outside the roots this app may modify"));
    }
    Ok(resolved)
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

fn guarded_rename(from: &str, to: &str, roots: &Roots) -> Result<(), String> {
    let source = checked(from, roots)?;
    let dest = checked(to, roots)?;
    require_regular_file(&source, from)?;
    if let Ok(existing) = fs::symlink_metadata(&dest) {
        if existing.file_type().is_symlink() || existing.is_dir() {
            return Err(format!("{to}: destination is a symlink or directory"));
        }
    }
    fs::rename(&source, &dest).map_err(|e| format!("rename {from} -> {to}: {e}"))
}

fn guarded_remove(path: &str, roots: &Roots) -> Result<(), String> {
    let target = checked(path, roots)?;
    require_regular_file(&target, path)?;
    fs::remove_file(&target).map_err(|e| format!("remove {path}: {e}"))
}

fn home() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("Could not resolve home directory")?;
    Ok(home.canonicalize().unwrap_or(home))
}

/// Rename one regular file inside the declared roots.
#[tauri::command]
pub fn guarded_rename_file(from: String, to: String) -> Result<(), String> {
    let home = home()?;
    guarded_rename(&from, &to, &Roots { home: &home, granted: &is_granted_root })
}

/// Delete one regular file inside the declared roots. Never a directory.
#[tauri::command]
pub fn guarded_remove_file(path: String) -> Result<(), String> {
    let home = home()?;
    guarded_remove(&path, &Roots { home: &home, granted: &is_granted_root })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::unix::fs::symlink;
    use tempfile::TempDir;

    const STORE: &str = ".claude/skills/review/SKILL.md";

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
        fn roots<'a>(&'a self, granted: &'a dyn Fn(&Path) -> bool) -> Roots<'a> {
            Roots { home: &self.home, granted }
        }
        fn s(path: &Path) -> String {
            path.to_string_lossy().into_owned()
        }
    }

    fn project_granted(f: &Fixture) -> impl Fn(&Path) -> bool {
        let project = f.project.clone();
        move |p: &Path| p.starts_with(&project)
    }

    #[test]
    fn rename_declared_store_temp_over_store() {
        let f = fixture();
        let store = f.home.join(STORE);
        let temp = f.home.join(format!("{STORE}{TEMP_MARKER}abc"));
        fs::write(&store, "old").unwrap();
        fs::write(&temp, "new").unwrap();
        let none = |_: &Path| false;
        guarded_rename(&Fixture::s(&temp), &Fixture::s(&store), &f.roots(&none)).unwrap();
        assert_eq!(fs::read_to_string(&store).unwrap(), "new");
        assert!(!temp.exists());
    }

    #[test]
    fn rename_inside_granted_project_root() {
        let f = fixture();
        let a = f.project.join("a.txt");
        let b = f.project.join("b.txt");
        fs::write(&a, "x").unwrap();
        let granted = project_granted(&f);
        guarded_rename(&Fixture::s(&a), &Fixture::s(&b), &f.roots(&granted)).unwrap();
        assert!(b.exists() && !a.exists());
    }

    #[test]
    fn remove_declared_store_and_backup() {
        let f = fixture();
        let store = f.home.join(STORE);
        fs::write(&store, "x").unwrap();
        let backups = f.home.join(".harness/backups/2026-01-01");
        fs::create_dir_all(&backups).unwrap();
        let backup = backups.join("transaction.json");
        fs::write(&backup, "{}").unwrap();
        let none = |_: &Path| false;
        guarded_remove(&Fixture::s(&store), &f.roots(&none)).unwrap();
        guarded_remove(&Fixture::s(&backup), &f.roots(&none)).unwrap();
        assert!(!store.exists() && !backup.exists());
    }

    #[test]
    fn remove_outside_roots_refused() {
        let f = fixture();
        let victim = f.outside.join("victim.txt");
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
        let none = |_: &Path| false;
        assert!(guarded_remove(&Fixture::s(&zshrc), &f.roots(&none)).is_err());
        assert!(zshrc.exists());
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
        let victim = f.outside.join("victim.txt");
        fs::write(&victim, "x").unwrap();
        let escape = format!("{}/../outside/victim.txt", Fixture::s(&f.project));
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
        let victim = f.outside.join("victim.txt");
        fs::write(&victim, "x").unwrap();
        let link = f.project.join("link");
        symlink(&f.outside, &link).unwrap();
        let through = link.join("victim.txt");
        let granted = project_granted(&f);
        assert!(guarded_remove(&Fixture::s(&through), &f.roots(&granted)).is_err());
        assert!(victim.exists());
    }

    #[test]
    fn symlink_source_refused_and_link_untouched() {
        let f = fixture();
        let target = f.outside.join("secret.txt");
        fs::write(&target, "secret").unwrap();
        let link = f.project.join("link.txt");
        symlink(&target, &link).unwrap();
        let granted = project_granted(&f);
        let dest = f.project.join("moved.txt");
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
        let dir = f.project.join("tree");
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
        let none = |_: &Path| false;
        assert!(guarded_remove(&Fixture::s(&sneaky), &f.roots(&none)).is_err());
    }
}
