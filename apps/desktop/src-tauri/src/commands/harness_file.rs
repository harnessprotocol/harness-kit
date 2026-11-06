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

    // Search priority:
    // 1. ~/.claude/harness.yaml
    // 2. ~/harness.yaml
    let candidates = [
        home.join(".claude").join("harness.yaml"),
        home.join("harness.yaml"),
    ];

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
        });
    }

    Ok(HarnessFileResult {
        found: false,
        content: None,
        path: None,
    })
}

/// Write content to ~/.claude/harness.yaml, creating the directory if needed.
/// Returns the display path on success.
///
/// `expected_sha256` is the digest of the file the page loaded from that path
/// (`None`: it did not exist). A mismatch is refused as "changed on disk"; the
/// old content is kept as `harness.yaml.bak-<timestamp>` and the file is
/// replaced atomically (AC-50).
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

/// Scan ~/.claude/ for existing Claude Code configuration that can be used
/// to generate a harness.yaml.
///
/// Claude Code stores MCP servers in mcp.json (no dot prefix) and
/// permissions in settings.local.json under the `permissions` key.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeConfigScan {
    /// Raw content of mcp.json / .mcp.json — whichever was found first.
    pub mcp_servers_json: Option<String>,
    /// Raw content of settings.local.json or settings.json — whichever was found first.
    pub settings_json: Option<String>,
    /// Which MCP file was found, for display in the UI.
    pub mcp_source: Option<String>,
    /// Which settings file was found, for display in the UI.
    pub settings_source: Option<String>,
}

#[tauri::command]
pub fn scan_claude_config() -> Result<ClaudeConfigScan, String> {
    scan_claude_config_in(&home_dir()?)
}

fn scan_claude_config_in(home: &Path) -> Result<ClaudeConfigScan, String> {
    let claude_dir = home.join(".claude");

    // MCP servers: mcp.json is the current Claude Code location; .mcp.json is a legacy fallback.
    let (mcp_servers_json, mcp_source) = [
        (claude_dir.join("mcp.json"), "~/.claude/mcp.json"),
        (claude_dir.join(".mcp.json"), "~/.claude/.mcp.json"),
    ]
    .into_iter()
    .find_map(|(path, label)| {
        std::fs::read_to_string(&path).ok().map(|c| (Some(c), Some(label.to_string())))
    })
    .unwrap_or((None, None));

    // Permissions: settings.local.json has per-user overrides (allow/deny/ask);
    // fall back to settings.json for users without a local file.
    let (settings_json, settings_source) = [
        (claude_dir.join("settings.local.json"), "~/.claude/settings.local.json"),
        (claude_dir.join("settings.json"), "~/.claude/settings.json"),
    ]
    .into_iter()
    .find_map(|(path, label)| {
        std::fs::read_to_string(&path).ok().map(|c| (Some(c), Some(label.to_string())))
    })
    .unwrap_or((None, None));

    Ok(ClaudeConfigScan { mcp_servers_json, settings_json, mcp_source, settings_source })
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
    fn read_harness_file_falls_back_to_home_root() {
        let dir = TempDir::new().unwrap();
        std::fs::write(dir.path().join("harness.yaml"), "version: \"1\"\n").unwrap();
        let result = read_harness_file_in(dir.path()).unwrap();
        assert!(result.found);
        assert_eq!(result.path.unwrap(), "~/harness.yaml");
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
        std::fs::create_dir(dir.path().join(".claude")).unwrap();
        std::fs::write(dir.path().join(".claude/harness.yaml"), content).unwrap();
        dir
    }

    fn harness_backups(home: &Path) -> Vec<std::path::PathBuf> {
        std::fs::read_dir(home.join(".claude"))
            .unwrap()
            .map(|e| e.unwrap().path())
            .filter(|p| p.file_name().unwrap().to_string_lossy().starts_with("harness.yaml.bak-"))
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

    #[test]
    fn scan_claude_config_returns_none_when_files_absent() {
        let dir = TempDir::new().unwrap();
        std::fs::create_dir(dir.path().join(".claude")).unwrap();
        let result = scan_claude_config_in(dir.path()).unwrap();
        assert!(result.mcp_servers_json.is_none());
        assert!(result.settings_json.is_none());
    }

    #[test]
    fn scan_claude_config_reads_mcp_and_settings() {
        let dir = TempDir::new().unwrap();
        let claude = dir.path().join(".claude");
        std::fs::create_dir(&claude).unwrap();
        std::fs::write(claude.join("mcp.json"), r#"{"mcpServers":{}}"#).unwrap();
        std::fs::write(claude.join("settings.local.json"), r#"{"permissions":{"allow":[]}}"#).unwrap();
        let result = scan_claude_config_in(dir.path()).unwrap();
        assert!(result.mcp_servers_json.is_some());
        assert_eq!(result.mcp_source.unwrap(), "~/.claude/mcp.json");
        assert!(result.settings_json.is_some());
        assert_eq!(result.settings_source.unwrap(), "~/.claude/settings.local.json");
    }
}
