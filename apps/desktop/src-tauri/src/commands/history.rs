use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

const MAX_VERSIONS_PER_FILE: usize = 20;
const MAX_TOTAL_BYTES: u64 = 5 * 1024 * 1024; // 5MB

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HistoryEntry {
    pub timestamp: String,
    pub content: String,
}

fn history_dir() -> Result<PathBuf, String> {
    let dir = dirs::home_dir()
        .ok_or("Could not resolve home directory")?
        .join(".harness-kit")
        .join("history");
    Ok(dir)
}

fn history_file_path(plugin_name: &str, file_path: &str) -> Result<PathBuf, String> {
    let dir = history_dir()?.join(plugin_name);
    // Encode the file path to a safe filename
    let encoded = file_path.replace(['/', '\\'], "__");
    Ok(dir.join(format!("{}.history.json", encoded)))
}

fn read_entries(path: &Path) -> Vec<HistoryEntry> {
    if !path.exists() {
        return vec![];
    }
    fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn write_entries(path: &Path, entries: &[HistoryEntry]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create history directory: {}", e))?;
    }
    let json = serde_json::to_string(entries)
        .map_err(|e| format!("Failed to serialize history: {}", e))?;
    fs::write(path, json)
        .map_err(|e| format!("Failed to write history file: {}", e))?;
    Ok(())
}

/// Compute total size of all files under the history root directory.
fn total_history_bytes() -> u64 {
    let dir = match history_dir() {
        Ok(d) => d,
        Err(_) => return 0,
    };
    if !dir.exists() {
        return 0;
    }
    walkdir::WalkDir::new(&dir)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .filter_map(|e| e.metadata().ok())
        .map(|m| m.len())
        .sum()
}

/// Evict oldest entries globally until total size is under budget.
fn evict_if_over_budget() -> Result<(), String> {
    let root = history_dir()?;
    if !root.exists() || total_history_bytes() <= MAX_TOTAL_BYTES {
        return Ok(());
    }

    // Collect all (history_file_path, entry_index, timestamp) tuples
    let mut all_entries: Vec<(PathBuf, usize, String)> = vec![];

    for file_entry in walkdir::WalkDir::new(&root)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.path().extension().map(|x| x == "json").unwrap_or(false))
        .filter(|e| e.file_type().is_file())
    {
        let entries = read_entries(file_entry.path());
        for (idx, entry) in entries.iter().enumerate() {
            all_entries.push((
                file_entry.path().to_path_buf(),
                idx,
                entry.timestamp.clone(),
            ));
        }
    }

    // Sort oldest first
    all_entries.sort_by(|a, b| a.2.cmp(&b.2));

    // Remove one at a time until under budget
    for (path, _, _) in &all_entries {
        if total_history_bytes() <= MAX_TOTAL_BYTES {
            break;
        }
        let mut entries = read_entries(path);
        if entries.is_empty() {
            continue;
        }
        // Remove the oldest entry (last, since newest is first)
        entries.pop();
        if entries.is_empty() {
            let _ = fs::remove_file(path);
        } else {
            write_entries(path, &entries)?;
        }
    }

    Ok(())
}

#[tauri::command]
pub fn read_file_history(plugin_name: String, file_path: String) -> Result<Vec<HistoryEntry>, String> {
    let path = history_file_path(&plugin_name, &file_path)?;
    Ok(read_entries(&path))
}

#[tauri::command]
pub fn push_file_history(plugin_name: String, file_path: String, content: String) -> Result<(), String> {
    let path = history_file_path(&plugin_name, &file_path)?;
    let mut entries = read_entries(&path);

    let entry = HistoryEntry {
        timestamp: chrono::Utc::now().to_rfc3339(),
        content,
    };

    // Insert at front (newest first)
    entries.insert(0, entry);

    // Enforce per-file cap
    entries.truncate(MAX_VERSIONS_PER_FILE);

    write_entries(&path, &entries)?;

    // Enforce storage budget
    evict_if_over_budget()?;

    Ok(())
}

#[tauri::command]
pub fn get_history_size() -> Result<u64, String> {
    Ok(total_history_bytes())
}
