#[tauri::command]
pub fn list_claude_dir() -> Result<Vec<String>, String> {
    let claude_dir = dirs::home_dir()
        .ok_or_else(|| "Could not resolve home directory".to_string())?
        .join(".claude");

    if !claude_dir.exists() {
        return Ok(vec![]);
    }

    let mut entries: Vec<String> = std::fs::read_dir(&claude_dir)
        .map_err(|e| format!("Failed to read ~/.claude/: {}", e))?
        .filter_map(|entry| {
            entry.ok().and_then(|e| {
                e.file_name().into_string().ok()
            })
        })
        .collect();

    entries.sort();
    Ok(entries)
}
