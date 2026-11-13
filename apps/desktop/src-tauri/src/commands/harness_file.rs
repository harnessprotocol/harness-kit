use std::path::Path;

use super::surface_write::write_user_file;

/// Resolve the user's home directory. The `*_in` functions below take the
/// home directory as a parameter so tests can pass a tempdir instead of
/// mutating the process-global `HOME`.
fn home_dir() -> Result<std::path::PathBuf, String> {
    dirs::home_dir().ok_or_else(|| "Could not resolve home directory".to_string())
}

#[derive(serde::Serialize)]
pub struct HarnessFileResult {
    pub found: bool,
    pub content: Option<String>,
    pub path: Option<String>,
    /// True when `~/.claude/harness.yaml` is absent but a file sits at
    /// `~/harness.yaml`, where older builds read it. A boolean only: that file
    /// is never read.
    pub legacy_home_file: bool,
}

#[tauri::command]
pub fn read_harness_file() -> Result<HarnessFileResult, String> {
    read_harness_file_in(&home_dir()?)
}

fn read_harness_file_in(home_raw: &Path) -> Result<HarnessFileResult, String> {
    let home_raw = home_raw.to_path_buf();
    // Canonicalize home so symlink-heavy temp paths (e.g. macOS /tmp → /private/tmp)
    // compare correctly against the canonicalized candidate paths below.
    let home = home_raw.canonicalize().unwrap_or(home_raw);

    // The personal profile is ~/.claude/harness.yaml and nothing else (AC-55).
    // Drift, Profile, Compile and onboarding all read this one path; a
    // ~/harness.yaml is not a harness.yaml to any of them, so it is not
    // read here either.
    let candidates = [home.join(".claude").join("harness.yaml")];

    for path in &candidates {
        // Use canonicalize() as the existence check — eliminates the TOCTOU
        // window that would exist between a separate exists() call and read.
        let canonical = match path.canonicalize() {
            Ok(p) => p,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => continue,
            Err(e) => return Err(format!("Invalid path: {}", e)),
        };
        if !canonical.starts_with(&home) {
            return Err("Access denied: path is outside home directory".to_string());
        }
        let relative = canonical.strip_prefix(&home).unwrap_or(&canonical);
        let display_path = format!("~/{}", relative.to_string_lossy());
        let content = std::fs::read_to_string(&canonical)
            .map_err(|e| format!("Failed to read {}: {}", display_path, e))?;
        return Ok(HarnessFileResult {
            found: true,
            content: Some(content),
            path: Some(display_path),
            legacy_home_file: false,
        });
    }

    // Existence only, so the UI can say the file is where it no longer looks.
    // Its content is never read.
    let legacy_home_file = std::fs::symlink_metadata(home.join("harness.yaml"))
        .map(|m| m.is_file())
        .unwrap_or(false);

    Ok(HarnessFileResult {
        found: false,
        content: None,
        path: None,
        legacy_home_file,
    })
}

/// Write content to ~/.claude/harness.yaml, creating the directory if needed.
/// Returns the display path on success.
///
/// `expected_sha256` is the digest of the file the page loaded from that path
/// (`None`: it did not exist). A mismatch is refused as "changed on disk"; the
/// old content is copied to `~/.harness/backups/user/<timestamp>/.claude/harness.yaml`
/// and the file is replaced atomically (AC-50).
#[tauri::command]
pub fn write_harness_file(content: String, expected_sha256: Option<String>) -> Result<String, String> {
    write_harness_file_in(&home_dir()?, content, expected_sha256.as_deref())
}

fn write_harness_file_in(
    home: &Path,
    content: String,
    expected_sha256: Option<&str>,
) -> Result<String, String> {
    let claude_dir = home.join(".claude");
    if !claude_dir.exists() {
        std::fs::create_dir_all(&claude_dir)
            .map_err(|e| format!("Failed to create .claude directory: {}", e))?;
    }

    let path = claude_dir.join("harness.yaml");
    write_user_file(&path, &content, expected_sha256)?;

    Ok("~/.claude/harness.yaml".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn read_harness_file_returns_not_found_when_absent() {
        let dir = TempDir::new().unwrap();
        let result = read_harness_file_in(dir.path()).unwrap();
        assert!(!result.found);
        assert!(result.content.is_none());
        assert!(result.path.is_none());
    }

    #[test]
    fn read_harness_file_reads_from_claude_dir() {
        let dir = TempDir::new().unwrap();
        let claude = dir.path().join(".claude");
        std::fs::create_dir(&claude).unwrap();
        std::fs::write(claude.join("harness.yaml"), "version: \"1\"\n").unwrap();
        let result = read_harness_file_in(dir.path()).unwrap();
        assert!(result.found);
        assert_eq!(result.content.unwrap(), "version: \"1\"\n");
        assert_eq!(result.path.unwrap(), "~/.claude/harness.yaml");
    }

    #[test]
    fn read_harness_file_ignores_a_file_at_the_home_root() {
        let dir = TempDir::new().unwrap();
        std::fs::write(dir.path().join("harness.yaml"), "version: \"1\"\n").unwrap();
        let result = read_harness_file_in(dir.path()).unwrap();
        assert!(!result.found);
        assert!(result.content.is_none());
    }

    #[test]
    fn read_harness_file_reports_a_home_root_file_as_existence_only() {
        let dir = TempDir::new().unwrap();
        std::fs::write(dir.path().join("harness.yaml"), "secret: x\n").unwrap();
        let result = read_harness_file_in(dir.path()).unwrap();
        assert!(result.legacy_home_file);
        // Existence only: the content is never read or returned.
        assert!(result.content.is_none());
        let json = serde_json::to_string(&result).unwrap();
        assert!(!json.contains("secret"));
    }

    #[test]
    fn read_harness_file_reports_no_legacy_file_when_claude_dir_has_one_or_none_exists() {
        let dir = TempDir::new().unwrap();
        assert!(!read_harness_file_in(dir.path()).unwrap().legacy_home_file);
        std::fs::write(dir.path().join("harness.yaml"), "a: 1\n").unwrap();
        std::fs::create_dir(dir.path().join(".claude")).unwrap();
        std::fs::write(dir.path().join(".claude/harness.yaml"), "b: 2\n").unwrap();
        let result = read_harness_file_in(dir.path()).unwrap();
        assert!(result.found);
        assert!(!result.legacy_home_file);
    }

    #[test]
    fn write_harness_file_creates_claude_dir_and_file() {
        let dir = TempDir::new().unwrap();
        let path = write_harness_file_in(dir.path(), "content: test".to_string(), None).unwrap();
        assert_eq!(path, "~/.claude/harness.yaml");
        let written = std::fs::read_to_string(dir.path().join(".claude/harness.yaml")).unwrap();
        assert_eq!(written, "content: test");
    }

    fn home_with_harness(content: &str) -> TempDir {
        let dir = TempDir::new().unwrap();
        super::super::surface_write::set_test_home(dir.path());
        std::fs::create_dir(dir.path().join(".claude")).unwrap();
        std::fs::write(dir.path().join(".claude/harness.yaml"), content).unwrap();
        dir
    }

    /// Backups of harness.yaml: under `~/.harness/backups/user`, never beside it.
    fn harness_backups(home: &Path) -> Vec<std::path::PathBuf> {
        let beside = std::fs::read_dir(home.join(".claude"))
            .unwrap()
            .filter(|e| e.as_ref().unwrap().file_name().to_string_lossy().contains(".bak-"))
            .count();
        assert_eq!(beside, 0, "a backup was written beside the file");
        super::super::surface_write::user_backups(home)
            .into_iter()
            .filter(|p| p.file_name().unwrap().to_string_lossy() == "harness.yaml")
            .collect()
    }

    #[test]
    fn write_harness_file_matching_digest_writes_and_backs_up() {
        let dir = home_with_harness("old: 1\n");
        let digest = super::super::surface_write::loaded_text_digest("old: 1\n");
        write_harness_file_in(dir.path(), "new: 2\n".to_string(), Some(&digest)).unwrap();
        let written = std::fs::read_to_string(dir.path().join(".claude/harness.yaml")).unwrap();
        assert_eq!(written, "new: 2\n");
        let backups = harness_backups(dir.path());
        assert_eq!(backups.len(), 1);
        assert_eq!(std::fs::read_to_string(&backups[0]).unwrap(), "old: 1\n");
    }

    #[test]
    fn write_harness_file_mismatched_digest_refuses() {
        let dir = home_with_harness("edited elsewhere\n");
        let stale = super::super::surface_write::loaded_text_digest("loaded\n");
        let err = write_harness_file_in(dir.path(), "new\n".to_string(), Some(&stale)).unwrap_err();
        assert!(err.contains("changed on disk"), "{}", err);
        let written = std::fs::read_to_string(dir.path().join(".claude/harness.yaml")).unwrap();
        assert_eq!(written, "edited elsewhere\n");
        assert!(harness_backups(dir.path()).is_empty());
    }

    #[test]
    fn write_harness_file_none_digest_on_existing_file_refuses() {
        let dir = home_with_harness("mine\n");
        let err = write_harness_file_in(dir.path(), "new\n".to_string(), None).unwrap_err();
        assert!(err.contains("changed on disk"), "{}", err);
        let written = std::fs::read_to_string(dir.path().join(".claude/harness.yaml")).unwrap();
        assert_eq!(written, "mine\n");
    }

    #[cfg(unix)]
    #[test]
    fn write_harness_file_replaces_the_inode() {
        use std::os::unix::fs::MetadataExt;
        let dir = home_with_harness("old\n");
        let file = dir.path().join(".claude/harness.yaml");
        let before = std::fs::metadata(&file).unwrap().ino();
        let digest = super::super::surface_write::loaded_text_digest("old\n");
        write_harness_file_in(dir.path(), "new\n".to_string(), Some(&digest)).unwrap();
        assert_ne!(std::fs::metadata(&file).unwrap().ino(), before);
    }
}
