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
    // Model lists reflect the Claude 5 / GPT-5.6 generation, current as of
    // July 2026. These pickers age fast by nature — re-verify against each
    // provider's current model lineup rather than assuming these stay current.
    let definitions: Vec<(&str, &str, &str, Vec<&str>)> = vec![
        ("claude", "Claude Code", "claude", vec![
            "claude-sonnet-5", "claude-opus-5", "claude-fable-5", "claude-haiku-4-5-20251001",
        ]),
        ("cursor-agent", "Cursor Agent", "cursor-agent", vec![]),
        ("copilot", "GitHub Copilot", "copilot", vec![
            "claude-sonnet-5", "gpt-5.6",
        ]),
        ("codex", "Codex CLI", "codex", vec![
            // gpt-5.6-terra is Codex CLI's own default tier; sol/luna are the
            // higher/lower tiers of the same GPT-5.6 family.
            "gpt-5.6-terra", "gpt-5.6-sol",
        ]),
        ("opencode", "OpenCode", "opencode", vec![
            "anthropic/claude-sonnet-5", "openai/gpt-5.6", "ollama/qwen3-coder",
        ]),
    ];

    let mut harnesses = Vec::new();

    for (id, name, check_cmd, default_models) in &definitions {
        let shell = app.shell();
        let output = shell
            .command(check_cmd)
            .args(vec!["--version"])
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
