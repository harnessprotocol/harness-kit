use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HookCommand {
    #[serde(rename = "type")]
    pub hook_type: String,
    pub command: String,
}

pub type HooksConfig = HashMap<String, Vec<HookCommand>>;

// Actual shape inside each matcher's hooks array
#[derive(Debug, Deserialize)]
struct RawHookEntry {
    #[serde(rename = "type")]
    hook_type: String,
    command: String,
}

// Actual shape: each event maps to a list of matchers, each with a hooks array
#[derive(Debug, Deserialize)]
struct RawHookMatcher {
    hooks: Vec<RawHookEntry>,
}

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

    // Parse the actual nested format: { Event: [{ matcher?, hooks: [{type, command}] }] }
    let raw: HashMap<String, Vec<RawHookMatcher>> = serde_json::from_value(hooks_val)
        .map_err(|e| format!("Failed to parse hooks config: {}", e))?;

    // Flatten each event's matchers into a single list of HookCommands
    let result = raw
        .into_iter()
        .filter_map(|(event, matchers)| {
            let commands: Vec<HookCommand> = matchers
                .into_iter()
                .flat_map(|m| {
                    m.hooks.into_iter().map(|h| HookCommand {
                        hook_type: h.hook_type,
                        command: h.command,
                    })
                })
                .collect();
            if commands.is_empty() {
                None
            } else {
                Some((event, commands))
            }
        })
        .collect();

    Ok(result)
}
