#[derive(serde::Serialize)]
pub struct HarnessFileResult {
    pub found: bool,
    pub content: Option<String>,
    pub path: Option<String>,
}

#[tauri::command]
pub fn read_harness_file() -> Result<HarnessFileResult, String> {
    let home = dirs::home_dir()
        .ok_or_else(|| "Could not resolve home directory".to_string())?;

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
#[tauri::command]
pub fn write_harness_file(content: String) -> Result<String, String> {
    let home = dirs::home_dir()
        .ok_or_else(|| "Could not resolve home directory".to_string())?;

    let claude_dir = home.join(".claude");
    if !claude_dir.exists() {
        std::fs::create_dir_all(&claude_dir)
            .map_err(|e| format!("Failed to create .claude directory: {}", e))?;
    }

    let path = claude_dir.join("harness.yaml");
    std::fs::write(&path, content)
        .map_err(|e| format!("Failed to write harness.yaml: {}", e))?;

    Ok("~/.claude/harness.yaml".to_string())
}

/// Scan ~/.claude/ for existing Claude Code configuration that can be used
/// to generate a harness.yaml: MCP servers (.mcp.json), settings (settings.json).
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeConfigScan {
    pub mcp_servers_json: Option<String>,
    pub settings_json: Option<String>,
}

#[tauri::command]
pub fn scan_claude_config() -> Result<ClaudeConfigScan, String> {
    let home = dirs::home_dir()
        .ok_or_else(|| "Could not resolve home directory".to_string())?;
    let claude_dir = home.join(".claude");

    let mcp_servers_json = std::fs::read_to_string(claude_dir.join(".mcp.json")).ok();
    let settings_json = std::fs::read_to_string(claude_dir.join("settings.json")).ok();

    Ok(ClaudeConfigScan { mcp_servers_json, settings_json })
}
