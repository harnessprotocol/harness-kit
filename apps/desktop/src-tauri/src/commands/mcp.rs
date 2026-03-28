#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpConfigResult {
    pub found: bool,
    /// Raw JSON of the `mcpServers` value only (not the full file).
    pub servers_json: Option<String>,
    /// Display path, e.g. "~/.claude/mcp.json".
    pub source: Option<String>,
}

/// Read `~/.claude/mcp.json` (falling back to `~/.claude/.mcp.json`) and
/// return just the `mcpServers` object as a JSON string.
#[tauri::command]
pub fn read_mcp_config() -> Result<McpConfigResult, String> {
    let home_raw = dirs::home_dir()
        .ok_or_else(|| "Could not resolve home directory".to_string())?;
    // Canonicalize home so symlink-heavy temp paths (e.g. macOS /tmp → /private/tmp)
    // compare correctly against the canonicalized candidate paths below.
    let home = home_raw.canonicalize().unwrap_or(home_raw);

    let claude_dir = home.join(".claude");

    // mcp.json is the current Claude Code location; .mcp.json is a legacy fallback.
    let candidates = [
        (claude_dir.join("mcp.json"), "~/.claude/mcp.json"),
        (claude_dir.join(".mcp.json"), "~/.claude/.mcp.json"),
    ];

    for (path, label) in &candidates {
        let canonical = match path.canonicalize() {
            Ok(p) => p,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => continue,
            Err(e) => return Err(format!("Invalid path: {}", e)),
        };
        if !canonical.starts_with(&home) {
            return Err("Access denied: path is outside home directory".to_string());
        }

        let content = std::fs::read_to_string(&canonical)
            .map_err(|e| format!("Failed to read {}: {}", label, e))?;

        let parsed: serde_json::Value = serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse {}: {}", label, e))?;

        let servers = parsed
            .get("mcpServers")
            .cloned()
            .unwrap_or(serde_json::Value::Object(serde_json::Map::new()));

        let servers_json = serde_json::to_string(&servers)
            .map_err(|e| format!("Failed to serialize mcpServers: {}", e))?;

        return Ok(McpConfigResult {
            found: true,
            servers_json: Some(servers_json),
            source: Some(label.to_string()),
        });
    }

    Ok(McpConfigResult {
        found: false,
        servers_json: None,
        source: None,
    })
}

/// Write `servers_json` into the `mcpServers` key of `~/.claude/mcp.json`,
/// preserving any other top-level keys that already exist in the file.
/// Returns the display path on success.
#[tauri::command]
pub fn write_mcp_config(servers_json: String) -> Result<String, String> {
    // Validate that the caller passed valid JSON before touching the filesystem.
    let servers_value: serde_json::Value = serde_json::from_str(&servers_json)
        .map_err(|e| format!("Invalid JSON for servers_json: {}", e))?;

    let home = dirs::home_dir()
        .ok_or_else(|| "Could not resolve home directory".to_string())?;

    let claude_dir = home.join(".claude");
    if !claude_dir.exists() {
        std::fs::create_dir_all(&claude_dir)
            .map_err(|e| format!("Failed to create .claude directory: {}", e))?;
    }

    let mcp_path = claude_dir.join("mcp.json");

    // Validate write target stays within home directory (symlink-safe)
    let home_canon = home.canonicalize().unwrap_or_else(|_| home.clone());
    let mcp_canon = mcp_path
        .canonicalize()
        .or_else(|_| {
            // File doesn't exist yet — validate the parent instead
            claude_dir.canonicalize().map(|p| p.join("mcp.json"))
        })
        .map_err(|e| format!("Invalid path: {}", e))?;
    if !mcp_canon.starts_with(&home_canon) {
        return Err("Access denied: write path is outside home directory".to_string());
    }

    // Start from the existing file contents so we don't clobber unknown keys.
    let mut root: serde_json::Map<String, serde_json::Value> = if mcp_path.exists() {
        let content = std::fs::read_to_string(&mcp_path)
            .map_err(|e| format!("Failed to read mcp.json: {}", e))?;
        match serde_json::from_str::<serde_json::Value>(&content) {
            Ok(serde_json::Value::Object(map)) => map,
            // If the existing file is malformed or not an object, start fresh.
            _ => serde_json::Map::new(),
        }
    } else {
        serde_json::Map::new()
    };

    root.insert("mcpServers".to_string(), servers_value);

    let output = serde_json::to_string_pretty(&serde_json::Value::Object(root))
        .map_err(|e| format!("Failed to serialize mcp.json: {}", e))?;

    std::fs::write(&mcp_path, output)
        .map_err(|e| format!("Failed to write mcp.json: {}", e))?;

    Ok("~/.claude/mcp.json".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;
    use tempfile::TempDir;

    fn with_home(dir: &TempDir, f: impl FnOnce()) {
        // Hold the crate-level lock so parallel tests don't race on HOME.
        let _guard = crate::HOME_LOCK.lock().unwrap();
        let old = env::var("HOME").ok();
        env::set_var("HOME", dir.path());
        f();
        match old {
            Some(v) => env::set_var("HOME", v),
            None => env::remove_var("HOME"),
        }
    }

    #[test]
    fn read_mcp_config_returns_not_found_when_absent() {
        let dir = TempDir::new().unwrap();
        with_home(&dir, || {
            let result = read_mcp_config().unwrap();
            assert!(!result.found);
            assert!(result.servers_json.is_none());
            assert!(result.source.is_none());
        });
    }

    #[test]
    fn read_mcp_config_reads_mcp_json() {
        let dir = TempDir::new().unwrap();
        let claude = dir.path().join(".claude");
        std::fs::create_dir(&claude).unwrap();
        std::fs::write(
            claude.join("mcp.json"),
            r#"{"mcpServers":{"test":{"command":"npx"}}}"#,
        )
        .unwrap();
        with_home(&dir, || {
            let result = read_mcp_config().unwrap();
            assert!(result.found);
            assert_eq!(result.source.unwrap(), "~/.claude/mcp.json");
            let servers: serde_json::Value =
                serde_json::from_str(&result.servers_json.unwrap()).unwrap();
            assert!(servers.get("test").is_some());
            assert_eq!(
                servers["test"]["command"],
                serde_json::Value::String("npx".to_string())
            );
        });
    }

    #[test]
    fn write_mcp_config_creates_file() {
        let dir = TempDir::new().unwrap();
        with_home(&dir, || {
            let servers = r#"{"my-server":{"command":"node","args":["server.js"]}}"#;
            let path = write_mcp_config(servers.to_string()).unwrap();
            assert_eq!(path, "~/.claude/mcp.json");

            let written =
                std::fs::read_to_string(dir.path().join(".claude/mcp.json")).unwrap();
            let parsed: serde_json::Value = serde_json::from_str(&written).unwrap();
            assert!(parsed.get("mcpServers").is_some());
            assert!(parsed["mcpServers"].get("my-server").is_some());
        });
    }

    #[test]
    fn write_mcp_config_preserves_unknown_keys() {
        let dir = TempDir::new().unwrap();
        let claude = dir.path().join(".claude");
        std::fs::create_dir(&claude).unwrap();
        std::fs::write(
            claude.join("mcp.json"),
            r#"{"extra":"value","mcpServers":{}}"#,
        )
        .unwrap();
        with_home(&dir, || {
            let new_servers = r#"{"added":{"command":"npx"}}"#;
            write_mcp_config(new_servers.to_string()).unwrap();

            let written =
                std::fs::read_to_string(dir.path().join(".claude/mcp.json")).unwrap();
            let parsed: serde_json::Value = serde_json::from_str(&written).unwrap();
            // Unknown key must survive the round-trip.
            assert_eq!(
                parsed.get("extra"),
                Some(&serde_json::Value::String("value".to_string()))
            );
            // New servers value must be written.
            assert!(parsed["mcpServers"].get("added").is_some());
        });
    }

    #[test]
    fn write_mcp_config_rejects_invalid_json() {
        let dir = TempDir::new().unwrap();
        with_home(&dir, || {
            let result = write_mcp_config("not valid json {{".to_string());
            assert!(result.is_err());
            let msg = result.unwrap_err();
            assert!(msg.contains("Invalid JSON"));
        });
    }

    #[test]
    fn read_mcp_config_falls_back_to_legacy_dot_mcp_json() {
        let dir = TempDir::new().unwrap();
        let claude = dir.path().join(".claude");
        std::fs::create_dir(&claude).unwrap();
        // Only write .mcp.json, not mcp.json
        std::fs::write(claude.join(".mcp.json"), r#"{"mcpServers":{"legacy":{"command":"npx"}}}"#).unwrap();
        with_home(&dir, || {
            let result = read_mcp_config().unwrap();
            assert!(result.found);
            assert_eq!(result.source.unwrap(), "~/.claude/.mcp.json");
            let servers: serde_json::Value =
                serde_json::from_str(&result.servers_json.unwrap()).unwrap();
            assert!(servers.get("legacy").is_some());
        });
    }

    #[test]
    fn write_mcp_config_handles_corrupted_existing_file() {
        let dir = TempDir::new().unwrap();
        let claude = dir.path().join(".claude");
        std::fs::create_dir(&claude).unwrap();
        std::fs::write(claude.join("mcp.json"), b"not valid json at all!!!").unwrap();
        with_home(&dir, || {
            let result = write_mcp_config(r#"{"new":{"command":"npx"}}"#.to_string());
            assert!(result.is_ok());
            let content = std::fs::read_to_string(claude.join("mcp.json")).unwrap();
            let parsed: serde_json::Value = serde_json::from_str(&content).unwrap();
            assert!(parsed.get("mcpServers").is_some());
        });
    }
}
