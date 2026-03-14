#[tauri::command]
pub fn read_claude_md(path: String) -> Result<String, String> {
    // Expand ~ to home directory
    let expanded = if path.starts_with("~/") {
        let home = dirs::home_dir()
            .ok_or_else(|| "Could not resolve home directory".to_string())?;
        home.join(&path[2..])
    } else {
        std::path::PathBuf::from(&path)
    };

    if !expanded.exists() {
        return Err(format!("File not found: {}", expanded.display()));
    }

    std::fs::read_to_string(&expanded)
        .map_err(|e| format!("Failed to read {}: {}", expanded.display(), e))
}
