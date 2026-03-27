use std::path::PathBuf;

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct CustomProfile {
    pub id: String,
    pub name: String,
    pub description: String,
    pub yaml: String,
}

fn profiles_dir() -> Result<PathBuf, String> {
    let home = dirs::home_dir()
        .ok_or_else(|| "Could not resolve home directory".to_string())?;
    Ok(home.join(".harness-kit").join("profiles"))
}

/// Validate a profile ID: lowercase kebab-case, no path traversal.
fn validate_id(id: &str) -> Result<(), String> {
    if id.is_empty() {
        return Err("Profile ID cannot be empty".to_string());
    }
    if id.contains('/') || id.contains('\\') || id.contains("..") {
        return Err("Invalid profile ID".to_string());
    }
    if !id.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-') {
        return Err("Profile ID must be lowercase kebab-case (a-z, 0-9, hyphens)".to_string());
    }
    Ok(())
}

/// Extract metadata.name and metadata.description from a harness YAML string.
fn extract_metadata(yaml: &str) -> (String, String) {
    let mut name = String::new();
    let mut description = String::new();
    let mut in_metadata = false;
    for line in yaml.lines() {
        let trimmed = line.trim_end();
        if trimmed == "metadata:" {
            in_metadata = true;
            continue;
        }
        if in_metadata {
            // End of metadata block when we hit a non-indented, non-empty line that isn't a key
            if !trimmed.is_empty() && !trimmed.starts_with(' ') && !trimmed.starts_with('\t') {
                break;
            }
            let stripped = trimmed.trim_start();
            if let Some(rest) = stripped.strip_prefix("name:") {
                name = rest.trim().trim_matches('"').trim_matches('\'').to_string();
            } else if let Some(rest) = stripped.strip_prefix("description:") {
                description = rest.trim().trim_matches('"').trim_matches('\'').to_string();
            }
        }
    }
    (name, description)
}

#[tauri::command]
pub fn list_custom_profiles() -> Result<Vec<CustomProfile>, String> {
    let dir = profiles_dir()?;
    if !dir.exists() {
        return Ok(vec![]);
    }
    let entries = std::fs::read_dir(&dir)
        .map_err(|e| format!("Failed to read profiles directory: {}", e))?;

    let mut profiles: Vec<CustomProfile> = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("yaml") {
            continue;
        }
        let id = match path.file_stem().and_then(|s| s.to_str()) {
            Some(s) => s.to_string(),
            None => continue,
        };
        let yaml = match std::fs::read_to_string(&path) {
            Ok(s) => s,
            Err(_) => continue,
        };
        let (name, description) = extract_metadata(&yaml);
        profiles.push(CustomProfile {
            id: id.clone(),
            name: if name.is_empty() { id } else { name },
            description,
            yaml,
        });
    }
    profiles.sort_by(|a, b| a.id.cmp(&b.id));
    Ok(profiles)
}

#[tauri::command]
pub fn save_custom_profile(id: String, content: String) -> Result<String, String> {
    validate_id(&id)?;
    let dir = profiles_dir()?;
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create profiles directory: {}", e))?;
    let path = dir.join(format!("{}.yaml", id));
    std::fs::write(&path, &content)
        .map_err(|e| format!("Failed to write profile: {}", e))?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn delete_custom_profile(id: String) -> Result<(), String> {
    validate_id(&id)?;
    let dir = profiles_dir()?;
    let path = dir.join(format!("{}.yaml", id));
    if !path.exists() {
        return Err(format!("Profile '{}' not found", id));
    }
    std::fs::remove_file(&path)
        .map_err(|e| format!("Failed to delete profile: {}", e))?;
    Ok(())
}
