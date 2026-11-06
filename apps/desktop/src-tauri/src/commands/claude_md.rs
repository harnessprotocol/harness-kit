use std::path::{Component, Path, PathBuf};

use super::surface_write::write_user_file;

fn home_dir() -> Result<PathBuf, String> {
    dirs::home_dir().ok_or_else(|| "Could not resolve home directory".to_string())
}

/// Expand a leading `~/` against `home`.
fn expand(home: &Path, path: &str) -> PathBuf {
    match path.strip_prefix("~/") {
        Some(stripped) => home.join(stripped),
        None => PathBuf::from(path),
    }
}

/// Read a file under `~/.claude`. Every caller edits a file there; nothing
/// else in the home directory is reachable through this command.
#[tauri::command]
pub fn read_claude_md(path: String) -> Result<String, String> {
    read_claude_md_in(&home_dir()?, &path)
}

fn read_claude_md_in(home: &Path, path: &str) -> Result<String, String> {
    let expanded = expand(home, path);
    let outside = || "Access denied: path is outside ~/.claude".to_string();

    // The path must sit inside ~/.claude as written, with no `.` or `..`.
    if has_dot_components(&expanded) || !expanded.starts_with(home.join(".claude")) {
        return Err(outside());
    }
    let file_name = expanded.file_name().ok_or_else(outside)?;
    let parent = expanded.parent().ok_or_else(outside)?;
    let Ok(canonical_parent) = parent.canonicalize() else {
        return Err(format!("File not found: {}", expanded.display()));
    };

    // Compare the containing directory, not the file. `~/.claude` itself may
    // be a symlink (canonicalized here), and so may the file: a
    // `~/.claude/CLAUDE.md` linked into a dotfiles repo is read through the
    // link. A symlinked directory below ~/.claude that leaves it is refused.
    let claude_dir = home
        .join(".claude")
        .canonicalize()
        .map_err(|e| format!("Invalid path: {}", e))?;
    if !canonical_parent.starts_with(&claude_dir) {
        return Err(outside());
    }
    let target = canonical_parent.join(file_name);
    if !target.exists() {
        return Err(format!("File not found: {}", expanded.display()));
    }

    std::fs::read_to_string(&target)
        .map_err(|e| format!("Failed to read {}: {}", target.display(), e))
}

fn has_dot_components(path: &Path) -> bool {
    path.components()
        .any(|c| matches!(c, Component::ParentDir | Component::CurDir))
}

/// Save a file under `~/.claude` (AC-50). `expected_sha256` is the digest of
/// what the page loaded; `None` means the file must not exist yet. A
/// mismatch is refused with a "changed on disk" error, and the old content is
/// kept as `<name>.bak-<timestamp>` before the file is replaced atomically.
#[tauri::command]
pub fn write_config_file(
    path: String,
    content: String,
    expected_sha256: Option<String>,
) -> Result<(), String> {
    write_config_file_in(&home_dir()?, &path, &content, expected_sha256.as_deref())
}

fn write_config_file_in(
    home: &Path,
    path: &str,
    content: &str,
    expected_sha256: Option<&str>,
) -> Result<(), String> {
    let expanded = expand(home, path);

    // Pre-check: the path must start within ~/.claude/ as written, and carry
    // no `.` or `..` (Path::starts_with compares components, so
    // `~/.claude/../x` would pass it). Nothing is created before this passes.
    let claude_dir = home.join(".claude");
    if has_dot_components(&expanded) || !expanded.starts_with(&claude_dir) {
        return Err("write_config_file: path must be within ~/.claude/".to_string());
    }

    // The deepest directory that already exists below the path must not leave
    // ~/.claude through a symlink; check that before create_dir_all makes
    // directories on the far side of it. When ~/.claude itself does not exist
    // yet, nothing below it can be a link.
    let mut existing = expanded.parent();
    while let Some(dir) = existing {
        if dir.exists() {
            break;
        }
        existing = dir.parent();
    }
    if let Some(dir) = existing.filter(|d| d.starts_with(&claude_dir)) {
        let within = match (dir.canonicalize(), claude_dir.canonicalize()) {
            (Ok(real), Ok(root)) => real.starts_with(root),
            _ => false,
        };
        if !within {
            return Err("write_config_file: path must be within ~/.claude/".to_string());
        }
    }

    // Ensure parent directory exists before canonicalization
    if let Some(parent) = expanded.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create parent directory: {}", e))?;
    }

    // Canonicalize parent (now guaranteed to exist) and rejoin filename.
    // This resolves any .. traversals in the path.
    let canonical_parent = expanded
        .parent()
        .ok_or_else(|| "Invalid path: no parent directory".to_string())?
        .canonicalize()
        .map_err(|e| format!("Failed to resolve parent directory: {}", e))?;

    let filename = expanded
        .file_name()
        .ok_or_else(|| "Invalid path: no filename".to_string())?;

    let safe_path = canonical_parent.join(filename);

    // Post-canonicalization check: resolved path must still be within ~/.claude/
    let canonical_claude = claude_dir
        .canonicalize()
        .map_err(|e| format!("Failed to resolve ~/.claude: {}", e))?;
    if !safe_path.starts_with(&canonical_claude) {
        return Err("write_config_file: path must be within ~/.claude/".to_string());
    }

    write_user_file(&safe_path, content, expected_sha256).map(|_| ())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::surface_write::loaded_text_digest;
    use tempfile::TempDir;

    fn home_with(file: &str, content: &str) -> TempDir {
        let home = TempDir::new().unwrap();
        let path = home.path().join(".claude").join(file);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, content).unwrap();
        home
    }

    fn backups(home: &Path, prefix: &str) -> Vec<PathBuf> {
        std::fs::read_dir(home.join(".claude"))
            .unwrap()
            .map(|e| e.unwrap().path())
            .filter(|p| p.file_name().unwrap().to_string_lossy().starts_with(prefix))
            .collect()
    }

    #[test]
    fn matching_digest_writes_and_keeps_a_backup() {
        let home = home_with("CLAUDE.md", "old\n");
        let digest = loaded_text_digest("old\n");
        write_config_file_in(home.path(), "~/.claude/CLAUDE.md", "new\n", Some(&digest)).unwrap();
        let file = home.path().join(".claude/CLAUDE.md");
        assert_eq!(std::fs::read_to_string(&file).unwrap(), "new\n");
        let found = backups(home.path(), "CLAUDE.md.bak-");
        assert_eq!(found.len(), 1);
        assert_eq!(std::fs::read_to_string(&found[0]).unwrap(), "old\n");
    }

    #[test]
    fn mismatched_digest_refuses_and_leaves_the_file_alone() {
        let home = home_with("CLAUDE.md", "changed elsewhere\n");
        let stale = loaded_text_digest("what the page loaded\n");
        let err = write_config_file_in(home.path(), "~/.claude/CLAUDE.md", "new\n", Some(&stale))
            .unwrap_err();
        assert!(err.contains("changed on disk"), "{}", err);
        let file = home.path().join(".claude/CLAUDE.md");
        assert_eq!(std::fs::read_to_string(&file).unwrap(), "changed elsewhere\n");
        assert!(backups(home.path(), "CLAUDE.md.bak-").is_empty());
    }

    #[test]
    fn none_digest_on_an_existing_file_refuses() {
        let home = home_with("CLAUDE.md", "mine\n");
        let err = write_config_file_in(home.path(), "~/.claude/CLAUDE.md", "new\n", None).unwrap_err();
        assert!(err.contains("changed on disk"), "{}", err);
        let file = home.path().join(".claude/CLAUDE.md");
        assert_eq!(std::fs::read_to_string(&file).unwrap(), "mine\n");
    }

    #[test]
    fn none_digest_creates_a_new_file_without_a_backup() {
        let home = TempDir::new().unwrap();
        write_config_file_in(home.path(), "~/.claude/new.md", "hi\n", None).unwrap();
        assert_eq!(std::fs::read_to_string(home.path().join(".claude/new.md")).unwrap(), "hi\n");
        assert!(backups(home.path(), "new.md.bak-").is_empty());
    }

    #[cfg(unix)]
    #[test]
    fn write_replaces_the_inode_instead_of_truncating_in_place() {
        use std::os::unix::fs::MetadataExt;
        let home = home_with("CLAUDE.md", "old\n");
        let file = home.path().join(".claude/CLAUDE.md");
        let before = std::fs::metadata(&file).unwrap().ino();
        let digest = loaded_text_digest("old\n");
        write_config_file_in(home.path(), "~/.claude/CLAUDE.md", "new\n", Some(&digest)).unwrap();
        assert_ne!(std::fs::metadata(&file).unwrap().ino(), before);
    }

    #[test]
    fn paths_outside_claude_dir_are_refused() {
        let home = home_with("CLAUDE.md", "x");
        let err = write_config_file_in(home.path(), "~/.zshrc", "x", None).unwrap_err();
        assert!(err.contains("within ~/.claude"), "{}", err);
        let err = write_config_file_in(home.path(), "~/.claude/../.zshrc", "x", None).unwrap_err();
        assert!(err.contains("within ~/.claude"), "{}", err);
    }

    #[test]
    fn read_is_limited_to_claude_dir() {
        let home = home_with("CLAUDE.md", "inside");
        std::fs::write(home.path().join(".zshrc"), "outside").unwrap();
        assert_eq!(read_claude_md_in(home.path(), "~/.claude/CLAUDE.md").unwrap(), "inside");
        let err = read_claude_md_in(home.path(), "~/.zshrc").unwrap_err();
        assert!(err.contains("outside ~/.claude"), "{}", err);
        let err = read_claude_md_in(home.path(), "~/.claude/../.zshrc").unwrap_err();
        assert!(err.contains("outside ~/.claude"), "{}", err);
    }
}

#[cfg(test)]
mod round2_tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn dotdot_path_creates_no_directory_outside_claude_dir() {
        let tmp = TempDir::new().unwrap();
        let base = tmp.path().canonicalize().unwrap();
        let home = base.join("home");
        std::fs::create_dir_all(home.join(".claude")).unwrap();
        let err = write_config_file_in(&home, "~/.claude/../../escape/a/b", "x", None).unwrap_err();
        assert!(err.contains("within ~/.claude"), "{err}");
        assert!(!base.join("escape").exists());
    }

    #[test]
    fn dotdot_is_refused_even_when_it_stays_inside() {
        let tmp = TempDir::new().unwrap();
        let home = tmp.path().canonicalize().unwrap();
        std::fs::create_dir_all(home.join(".claude")).unwrap();
        let err = write_config_file_in(&home, "~/.claude/sub/../x.md", "x", None).unwrap_err();
        assert!(err.contains("within ~/.claude"), "{err}");
        assert!(!home.join(".claude/sub").exists());
        assert!(!home.join(".claude/x.md").exists());
    }

    #[cfg(unix)]
    #[test]
    fn symlinked_subdir_leaving_claude_dir_creates_no_directory_outside() {
        let tmp = TempDir::new().unwrap();
        let base = tmp.path().canonicalize().unwrap();
        let home = base.join("home");
        let outside = base.join("outside");
        std::fs::create_dir_all(home.join(".claude")).unwrap();
        std::fs::create_dir_all(&outside).unwrap();
        std::os::unix::fs::symlink(&outside, home.join(".claude/link")).unwrap();
        let err = write_config_file_in(&home, "~/.claude/link/new/f.md", "x", None).unwrap_err();
        assert!(err.contains("within ~/.claude"), "{err}");
        assert!(!outside.join("new").exists());
    }

    #[cfg(unix)]
    #[test]
    fn symlinked_claude_md_into_dotfiles_is_readable() {
        let tmp = TempDir::new().unwrap();
        let base = tmp.path().canonicalize().unwrap();
        let home = base.join("home");
        let dotfiles = base.join("dotfiles");
        std::fs::create_dir_all(home.join(".claude")).unwrap();
        std::fs::create_dir_all(&dotfiles).unwrap();
        std::fs::write(dotfiles.join("CLAUDE.md"), "from dotfiles").unwrap();
        std::os::unix::fs::symlink(dotfiles.join("CLAUDE.md"), home.join(".claude/CLAUDE.md")).unwrap();
        assert_eq!(read_claude_md_in(&home, "~/.claude/CLAUDE.md").unwrap(), "from dotfiles");
    }

    #[cfg(unix)]
    #[test]
    fn symlinked_claude_dir_is_readable_and_a_linked_subdir_is_not() {
        let tmp = TempDir::new().unwrap();
        let base = tmp.path().canonicalize().unwrap();
        let home = base.join("home");
        let dotfiles = base.join("dotfiles/claude");
        let outside = base.join("outside");
        std::fs::create_dir_all(&home).unwrap();
        std::fs::create_dir_all(&dotfiles).unwrap();
        std::fs::create_dir_all(&outside).unwrap();
        std::fs::write(dotfiles.join("CLAUDE.md"), "dir link").unwrap();
        std::fs::write(outside.join("secret"), "secret").unwrap();
        std::os::unix::fs::symlink(&dotfiles, home.join(".claude")).unwrap();
        assert_eq!(read_claude_md_in(&home, "~/.claude/CLAUDE.md").unwrap(), "dir link");
        std::os::unix::fs::symlink(&outside, dotfiles.join("sub")).unwrap();
        let err = read_claude_md_in(&home, "~/.claude/sub/secret").unwrap_err();
        assert!(err.contains("outside ~/.claude"), "{err}");
    }
}
