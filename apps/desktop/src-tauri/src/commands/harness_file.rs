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
        if path.exists() {
            let canonical = path
                .canonicalize()
                .map_err(|e| format!("Invalid path: {}", e))?;
            if !canonical.starts_with(&home) {
                return Err("Access denied: path is outside home directory".to_string());
            }
            let content = std::fs::read_to_string(&canonical)
                .map_err(|e| format!("Failed to read {}: {}", canonical.display(), e))?;
            // Return a ~-relative path so the frontend can display it cross-platform
            let relative = canonical.strip_prefix(&home).unwrap_or(&canonical);
            let path_str = format!("~/{}", relative.to_string_lossy());
            return Ok(HarnessFileResult {
                found: true,
                content: Some(content),
                path: Some(path_str),
            });
        }
    }

    Ok(HarnessFileResult {
        found: false,
        content: None,
        path: None,
    })
}
