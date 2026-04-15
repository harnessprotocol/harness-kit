#[derive(serde::Serialize)]
pub struct ClaudeAccountInfo {
    pub logged_in: bool,
    pub subscription_type: Option<String>,
    /// Whether `--permission-mode auto` is available for this account.
    pub auto_mode_available: bool,
}

/// Common install locations for the `claude` CLI.
/// macOS GUI apps (Tauri) launch with a minimal PATH that often omits
/// Homebrew, npm global, and nvm directories — so we probe known paths first.
fn claude_binary_path() -> Option<std::path::PathBuf> {
    let home = std::env::var("HOME").unwrap_or_default();
    let candidates: Vec<String> = vec![
        "/opt/homebrew/bin/claude".into(),
        "/usr/local/bin/claude".into(),
        format!("{home}/.npm-global/bin/claude"),
        format!("{home}/Library/pnpm/claude"),
        format!("{home}/.local/bin/claude"),
        format!("{home}/.nvm/versions/node/$(ls {home}/.nvm/versions/node 2>/dev/null | tail -1)/bin/claude"),
    ];
    for c in &candidates {
        let p = std::path::Path::new(c);
        if p.exists() {
            return Some(p.to_path_buf());
        }
    }
    // Last resort: ask the shell (handles nvm, volta, etc.)
    if let Ok(out) = std::process::Command::new("/bin/sh")
        .args(["-lc", "which claude 2>/dev/null"])
        .output()
    {
        let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if !s.is_empty() {
            return Some(std::path::PathBuf::from(s));
        }
    }
    None
}

/// Run `claude auth status` and parse the result to determine plan eligibility.
#[tauri::command]
pub async fn detect_claude_account() -> ClaudeAccountInfo {
    let Some(claude_bin) = claude_binary_path() else {
        return ClaudeAccountInfo { logged_in: false, subscription_type: None, auto_mode_available: false };
    };

    let output = std::process::Command::new(&claude_bin)
        .args(["auth", "status"])
        .output();

    let out = match output {
        Ok(o) if o.status.success() => o,
        _ => return ClaudeAccountInfo { logged_in: false, subscription_type: None, auto_mode_available: false },
    };

    let json_str = String::from_utf8_lossy(&out.stdout);
    let json: serde_json::Value = match serde_json::from_str(&json_str) {
        Ok(v) => v,
        Err(_) => return ClaudeAccountInfo { logged_in: false, subscription_type: None, auto_mode_available: false },
    };

    let logged_in = json.get("loggedIn").and_then(|v| v.as_bool()).unwrap_or(false);
    let sub_type = json.get("subscriptionType")
        .and_then(|v| v.as_str())
        .map(String::from);
    let auth_method = json.get("authMethod").and_then(|v| v.as_str()).unwrap_or("");

    // Auto mode requires team, enterprise, or API key — not available on pro/max.
    let auto_available = logged_in && (
        auth_method == "apiKey" ||
        matches!(sub_type.as_deref(), Some("team") | Some("enterprise") | Some("business"))
    );

    ClaudeAccountInfo { logged_in, subscription_type: sub_type, auto_mode_available: auto_available }
}

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
