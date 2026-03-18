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
