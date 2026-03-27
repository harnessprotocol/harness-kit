use std::path::PathBuf;

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct CustomProfile {
    pub id: String,
    pub name: String,
    pub description: String,
}

fn profiles_dir() -> Result<PathBuf, String> {
    let home = dirs::home_dir()
        .ok_or_else(|| "Could not resolve home directory".to_string())?;
    Ok(home.join(".harness-kit").join("profiles"))
}

/// Validate a profile ID: lowercase kebab-case, no path traversal, max 64 chars.
fn validate_id(id: &str) -> Result<(), String> {
    if id.is_empty() {
        return Err("Profile ID cannot be empty".to_string());
    }
    if id.len() > 64 {
        return Err("Profile ID must be 64 characters or fewer".to_string());
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
///
/// Uses line-by-line parsing intentionally: the full YAML parser is on the
/// frontend. This is only needed for display in the picker. Block scalars
/// (description: |) produce an empty description rather than garbled text.
fn extract_metadata(yaml: &str) -> (String, String) {
    let mut name = String::new();
    let mut description = String::new();
    let mut in_metadata = false;
    let mut in_block_scalar = false;

    for line in yaml.lines() {
        // `trim_end` preserves leading whitespace, which is what we use for
        // indentation detection below.
        let trimmed_end = line.trim_end();

        // Only enter the metadata block at root level (column 0, no indent).
        if trimmed_end == "metadata:" {
            in_metadata = true;
            in_block_scalar = false;
            continue;
        }

        if !in_metadata {
            continue;
        }

        // Exit when we hit a new root-level key (no leading whitespace).
        if !trimmed_end.is_empty()
            && !trimmed_end.starts_with(' ')
            && !trimmed_end.starts_with('\t')
            && !trimmed_end.starts_with('#')
        {
            break;
        }

        // Skip continuation lines of a block scalar.
        if in_block_scalar {
            if trimmed_end.starts_with("  ") || trimmed_end.starts_with('\t') || trimmed_end.is_empty() {
                continue;
            }
            in_block_scalar = false;
        }

        let stripped = trimmed_end.trim_start();
        if let Some(rest) = stripped.strip_prefix("name:") {
            let val = rest.trim().trim_matches('"').trim_matches('\'').to_string();
            if !is_block_scalar_indicator(&val) {
                name = val;
            }
        } else if let Some(rest) = stripped.strip_prefix("description:") {
            let val = rest.trim().trim_matches('"').trim_matches('\'').to_string();
            if is_block_scalar_indicator(&val) {
                in_block_scalar = true;
                // description stays empty — multi-line descriptions not parsed
            } else {
                description = val;
            }
        }
    }
    (name, description)
}

fn is_block_scalar_indicator(s: &str) -> bool {
    matches!(s, "|" | ">" | "|-" | ">-" | "|+" | ">+" | "|2" | ">2")
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
        // Read file only to extract metadata for display; yaml is not returned.
        let yaml = match std::fs::read_to_string(&path) {
            Ok(s) => s,
            Err(_) => continue,
        };
        let (name, description) = extract_metadata(&yaml);
        profiles.push(CustomProfile {
            id: id.clone(),
            name: if name.is_empty() { id } else { name },
            description,
        });
    }
    profiles.sort_by(|a, b| a.id.cmp(&b.id));
    Ok(profiles)
}

/// Return the full YAML content of a single custom profile.
/// Callers should fetch this on demand rather than loading all profiles upfront.
#[tauri::command]
pub fn get_custom_profile(id: String) -> Result<String, String> {
    validate_id(&id)?;
    let dir = profiles_dir()?;
    let path = dir.join(format!("{}.yaml", id));
    std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read profile '{}': {}", id, e))
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_metadata_basic() {
        let yaml = "version: \"1\"\nmetadata:\n  name: My Profile\n  description: A test profile\nplugins: []";
        let (name, desc) = extract_metadata(yaml);
        assert_eq!(name, "My Profile");
        assert_eq!(desc, "A test profile");
    }

    #[test]
    fn test_extract_metadata_quoted_values() {
        let yaml = "metadata:\n  name: \"Quoted Name\"\n  description: 'Single quoted desc'";
        let (name, desc) = extract_metadata(yaml);
        assert_eq!(name, "Quoted Name");
        assert_eq!(desc, "Single quoted desc");
    }

    #[test]
    fn test_extract_metadata_block_scalar_description() {
        // Block scalar description should not set description to "|" — leave empty.
        let yaml = "metadata:\n  name: block-test\n  description: |\n    This is a multi-line\n    description.\nplugins: []";
        let (name, desc) = extract_metadata(yaml);
        assert_eq!(name, "block-test");
        assert_eq!(desc, ""); // block scalars fall back to empty
    }

    #[test]
    fn test_extract_metadata_nested_metadata_ignored() {
        // An indented `metadata:` inside another key must not trigger in_metadata.
        let yaml = "plugins:\n  - config:\n      metadata:\n        name: should-not-appear\nmetadata:\n  name: correct\n  description: right\n";
        let (name, desc) = extract_metadata(yaml);
        assert_eq!(name, "correct");
        assert_eq!(desc, "right");
    }

    #[test]
    fn test_extract_metadata_no_metadata_section() {
        let yaml = "version: \"1\"\nplugins: []";
        let (name, desc) = extract_metadata(yaml);
        assert_eq!(name, "");
        assert_eq!(desc, "");
    }

    #[test]
    fn test_extract_metadata_stops_at_next_root_key() {
        let yaml = "metadata:\n  name: stops-here\nplugins:\n  - name: research";
        let (name, _) = extract_metadata(yaml);
        assert_eq!(name, "stops-here");
    }

    #[test]
    fn test_validate_id_valid() {
        assert!(validate_id("my-profile").is_ok());
        assert!(validate_id("profile-123").is_ok());
        assert!(validate_id("a").is_ok());
        assert!(validate_id(&"x".repeat(64)).is_ok());
    }

    #[test]
    fn test_validate_id_too_long() {
        assert!(validate_id(&"a".repeat(65)).is_err());
    }

    #[test]
    fn test_validate_id_invalid() {
        assert!(validate_id("").is_err());
        assert!(validate_id("has space").is_err());
        assert!(validate_id("has/slash").is_err());
        assert!(validate_id("../escape").is_err());
        assert!(validate_id("UPPERCASE").is_err());
        assert!(validate_id("has.dot").is_err());
    }
}
