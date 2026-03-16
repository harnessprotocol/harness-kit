#[tauri::command]
pub fn read_claude_md(path: String) -> Result<String, String> {
    let home = dirs::home_dir()
        .ok_or_else(|| "Could not resolve home directory".to_string())?;

    // Expand ~ to home directory
    let expanded = if let Some(stripped) = path.strip_prefix("~/") {
        home.join(stripped)
    } else {
        std::path::PathBuf::from(&path)
    };

    if !expanded.exists() {
        return Err(format!("File not found: {}", expanded.display()));
    }

    // Canonicalize and restrict to home directory
    let canonical = expanded
        .canonicalize()
        .map_err(|e| format!("Invalid path: {}", e))?;
    if !canonical.starts_with(&home) {
        return Err("Access denied: path is outside home directory".to_string());
    }

    std::fs::read_to_string(&canonical)
        .map_err(|e| format!("Failed to read {}: {}", canonical.display(), e))
}
