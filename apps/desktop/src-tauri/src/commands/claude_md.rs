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

#[tauri::command]
pub fn write_config_file(path: String, content: String) -> Result<(), String> {
    let home = dirs::home_dir()
        .ok_or_else(|| "Could not resolve home directory".to_string())?;

    // Expand ~ to home directory
    let expanded = if let Some(stripped) = path.strip_prefix("~/") {
        home.join(stripped)
    } else {
        std::path::PathBuf::from(&path)
    };

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

    // Canonicalize parent (now guaranteed to exist) and rejoin filename
    // This resolves any .. traversals in the path
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
    if !safe_path.starts_with(&claude_dir) {
        return Err("write_config_file: path must be within ~/.claude/".to_string());
    }

    std::fs::write(&safe_path, content)
        .map_err(|e| format!("Failed to write {}: {}", safe_path.display(), e))
}
