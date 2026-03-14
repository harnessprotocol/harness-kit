use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HookCommand {
    #[serde(rename = "type")]
    pub hook_type: String,
    pub command: String,
}

// HooksConfig maps event name -> list of hook commands
pub type HooksConfig = HashMap<String, Vec<HookCommand>>;

fn claude_dir() -> Option<std::path::PathBuf> {
    dirs::home_dir().map(|h| h.join(".claude"))
}

#[tauri::command]
pub fn read_hooks() -> Result<HooksConfig, String> {
    let settings_path = claude_dir()
        .ok_or_else(|| "Could not resolve home directory".to_string())?
        .join("settings.json");

    if !settings_path.exists() {
        return Ok(HooksConfig::new());
    }

    let contents = std::fs::read_to_string(&settings_path)
        .map_err(|e| format!("Failed to read settings.json: {}", e))?;

    let settings: serde_json::Value = serde_json::from_str(&contents)
        .map_err(|e| format!("Failed to parse settings.json: {}", e))?;

    let hooks_val = match settings.get("hooks") {
        Some(h) => h.clone(),
        None => return Ok(HooksConfig::new()),
    };

    serde_json::from_value::<HooksConfig>(hooks_val)
        .map_err(|e| format!("Failed to parse hooks config: {}", e))
}
