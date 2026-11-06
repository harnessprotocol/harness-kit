use std::path::{Path, PathBuf};

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

    if !expanded.exists() {
        return Err(format!("File not found: {}", expanded.display()));
    }

    // Canonicalize both sides so symlinked temp dirs and `..` compare correctly.
    let claude_dir = home
        .join(".claude")
        .canonicalize()
        .map_err(|e| format!("Invalid path: {}", e))?;
    let canonical = expanded
        .canonicalize()
        .map_err(|e| format!("Invalid path: {}", e))?;
    if !canonical.starts_with(&claude_dir) {
        return Err("Access denied: path is outside ~/.claude".to_string());
    }

    std::fs::read_to_string(&canonical)
        .map_err(|e| format!("Failed to read {}: {}", canonical.display(), e))
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

    // Pre-check: path must nominally start within ~/.claude/ before any resolution
    let claude_dir = home.join(".claude");
    if !expanded.starts_with(&claude_dir) {
        return Err("write_config_file: path must be within ~/.claude/".to_string());
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
