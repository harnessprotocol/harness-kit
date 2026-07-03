use serde::{Deserialize, Serialize};
use tauri::AppHandle;

// ── Harness info (returned by detect_harnesses) ─────────────
//
// Used by the Parity dashboard to detect which CLI coding harnesses are
// installed and authenticated on the machine. Split out from the (removed)
// terminal module — this has no dependency on PTY/terminal sessions.

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HarnessInfo {
    pub id: String,
    pub name: String,
    pub command: String,
    pub available: bool,
    pub version: Option<String>,
    pub mode: Option<String>,
    pub authenticated: bool,
    pub models: Vec<String>,
    pub default_model: Option<String>,
}

/// Detect available CLI harnesses (claude, copilot, cursor agent, codex).
#[tauri::command]
pub async fn detect_harnesses(app: AppHandle) -> Result<Vec<HarnessInfo>, String> {
    use tauri_plugin_shell::ShellExt;

    // (id, display name, binary name, default models)
    let definitions: Vec<(&str, &str, &str, Vec<&str>)> = vec![
        ("claude", "Claude Code", "claude", vec![
            "claude-sonnet-4-6", "claude-opus-4-6", "claude-haiku-4-5",
        ]),
        ("cursor-agent", "Cursor Agent", "agent", vec![]),
        ("copilot", "GitHub Copilot", "copilot", vec![
            "claude-sonnet-4", "gpt-5",
        ]),
        ("codex", "Codex CLI", "codex", vec![
            "o4-mini", "gpt-4.1",
        ]),
        ("opencode", "OpenCode", "opencode", vec![
            "anthropic/claude-sonnet-4-5", "openai/gpt-4o", "ollama/qwen2.5-coder",
        ]),
    ];

    let mut harnesses = Vec::new();
    // GUI apps launched from Finder don't inherit the user's interactive shell
    // PATH, so a bare `claude --version` can't find Homebrew/npm/etc. binaries.
    // Probe through a login shell so the real PATH is loaded first.
    let user_shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());

    for (id, name, check_cmd, default_models) in &definitions {
        let shell = app.shell();
        let probe = format!("{} --version", check_cmd);
        let output = shell
            .command(&user_shell)
            .args(vec!["-lc", probe.as_str()])
            .output()
            .await;

        let available = output.as_ref().is_ok_and(|o| o.status.success());
        let version = output
            .as_ref()
            .ok()
            .filter(|o| o.status.success())
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string());

        let authenticated = available;

        let models: Vec<String> = if available {
            default_models.iter().map(|m| m.to_string()).collect()
        } else {
            vec![]
        };
        let default_model = models.first().cloned();

        harnesses.push(HarnessInfo {
            id: id.to_string(),
            name: name.to_string(),
            command: check_cmd.to_string(),
            available,
            version,
            mode: if available {
                Some("supported".to_string())
            } else {
                None
            },
            authenticated,
            models,
            default_model,
        });
    }

    Ok(harnesses)
}
