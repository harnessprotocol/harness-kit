use portable_pty::{CommandBuilder, PtySize, native_pty_system};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::Read;
use std::sync::Mutex;
use std::time::Instant;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_shell::ShellExt;

// ── Types ───────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HarnessInfo {
    pub id: String,
    pub name: String,
    pub command: String,
    pub available: bool,
    pub version: Option<String>,
    pub mode: Option<String>, // "supported" | "unsupported" | null
    pub authenticated: bool,
    pub models: Vec<String>,
    pub default_model: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PanelConfig {
    pub panel_id: String,
    pub harness_id: String,
    pub model: Option<String>,
    pub working_dir: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComparisonRequest {
    pub comparison_id: String,
    pub prompt: String,
    pub working_dir: String,
    #[allow(dead_code)]
    pub pinned_commit: Option<String>,
    pub panels: Vec<PanelConfig>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PanelOutput {
    pub comparison_id: String,
    pub panel_id: String,
    pub stream: String, // "stdout" | "stderr"
    pub data: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PanelComplete {
    pub comparison_id: String,
    pub panel_id: String,
    pub exit_code: Option<i32>,
    pub duration_ms: u64,
}

// ── Managed state ───────────────────────────────────────────

pub struct ComparatorState {
    // Stores a killer per panel so kill_panel can stop the PTY child.
    pub killers: Mutex<HashMap<String, Box<dyn portable_pty::ChildKiller + Send + Sync>>>,
}

impl Default for ComparatorState {
    fn default() -> Self {
        Self {
            killers: Mutex::new(HashMap::new()),
        }
    }
}

// ── Known harnesses ─────────────────────────────────────────

struct HarnessDef {
    id: &'static str,
    name: &'static str,
    command: &'static str,
    version_args: &'static [&'static str],
    models: &'static [&'static str],
    default_model: &'static str,
}

const KNOWN_HARNESSES: &[HarnessDef] = &[
    HarnessDef {
        id: "claude",
        name: "Claude Code",
        command: "claude",
        version_args: &["--version"],
        models: &["claude-sonnet-4-6", "claude-opus-4-6", "claude-haiku-4-5-20251001"],
        default_model: "claude-sonnet-4-6",
    },
    HarnessDef {
        id: "cursor",
        name: "Cursor",
        command: "cursor",
        version_args: &["--version"],
        models: &["claude-sonnet-4-6", "gpt-4o", "gemini-2.5-pro"],
        default_model: "claude-sonnet-4-6",
    },
    HarnessDef {
        id: "gh-copilot",
        name: "GitHub Copilot",
        command: "copilot",
        version_args: &["--version"],
        models: &["claude-haiku-4.5", "gpt-5-mini", "gpt-4.1"],
        default_model: "claude-haiku-4.5",
    },
];

// ── Commands ────────────────────────────────────────────────

#[tauri::command]
pub async fn detect_harnesses(app: AppHandle) -> Result<Vec<HarnessInfo>, String> {
    let mut results = Vec::new();

    for def in KNOWN_HARNESSES {
        let shell = app.shell();
        let output = shell
            .command(def.command)
            .args(def.version_args)
            .output()
            .await;

        match output {
            Ok(out) if out.status.success() => {
                let version = String::from_utf8_lossy(&out.stdout)
                    .trim()
                    .to_string();

                // Check authentication per harness
                let authenticated = match def.id {
                    "cursor" => {
                        // Try a minimal invocation with a 5s timeout to detect auth errors
                        let auth_result = tokio::time::timeout(
                            std::time::Duration::from_secs(5),
                            app.shell()
                                .command("cursor")
                                .args(&["agent", "-p", "--trust", "test"])
                                .output(),
                        )
                        .await;

                        match auth_result {
                            Ok(Ok(auth_out)) => {
                                let stderr =
                                    String::from_utf8_lossy(&auth_out.stderr).to_lowercase();
                                !stderr.contains("authentication required")
                                    && !stderr.contains("login")
                            }
                            // Timeout or error — assume not authenticated
                            _ => false,
                        }
                    }
                    // Claude and Copilot handle auth at runtime
                    _ => true,
                };

                results.push(HarnessInfo {
                    id: def.id.to_string(),
                    name: def.name.to_string(),
                    command: def.command.to_string(),
                    available: true,
                    version: if version.is_empty() { None } else { Some(version) },
                    mode: Some("supported".to_string()),
                    authenticated,
                    models: def.models.iter().map(|s| s.to_string()).collect(),
                    default_model: Some(def.default_model.to_string()),
                });
            }
            _ => {
                results.push(HarnessInfo {
                    id: def.id.to_string(),
                    name: def.name.to_string(),
                    command: def.command.to_string(),
                    available: false,
                    version: None,
                    mode: None,
                    authenticated: false,
                    models: vec![],
                    default_model: None,
                });
            }
        }
    }

    Ok(results)
}

#[tauri::command]
pub async fn start_comparison(
    app: AppHandle,
    state: State<'_, ComparatorState>,
    request: ComparisonRequest,
) -> Result<(), String> {
    let comparison_id = request.comparison_id.clone();

    for panel in &request.panels {
        let panel_id = panel.panel_id.clone();
        let comp_id = comparison_id.clone();
        let key = format!("{}:{}", comp_id, panel_id);

        let (cmd_name, args) = build_command_args(
            &panel.harness_id,
            &request.prompt,
            panel.model.as_deref(),
        )?;

        let cwd = panel
            .working_dir
            .as_deref()
            .unwrap_or(&request.working_dir)
            .to_string();

        // Open a PTY pair — the child process sees a real terminal, so output
        // is not buffered and ANSI color/progress codes flow through live.
        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows: 50,
                cols: 220,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("openpty: {e}"))?;

        let mut cmd = CommandBuilder::new(cmd_name);
        for arg in &args {
            cmd.arg(arg);
        }
        cmd.env("TERM", "xterm-256color");
        cmd.env("FORCE_COLOR", "1");
        cmd.env("CLICOLOR_FORCE", "1");
        if !cwd.is_empty() {
            cmd.cwd(&cwd);
        }

        let mut child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| format!("Failed to spawn {}: {e}", panel.harness_id))?;
        drop(pair.slave);

        // Clone the reader BEFORE dropping master. The dup'd fd in `reader`
        // keeps the PTY master alive so the child doesn't receive SIGHUP.
        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| format!("clone_reader: {e}"))?;
        drop(pair.master);

        // Store a killer handle for kill_panel support.
        {
            let mut killers = state.killers.lock().map_err(|e| e.to_string())?;
            killers.insert(key.clone(), child.clone_killer());
        }

        let app_handle = app.clone();
        let panel_id_clone = panel_id.clone();
        let comp_id_clone = comp_id.clone();
        let key_clone = key.clone();
        let started = Instant::now();

        // Blocking reader thread — PTY I/O is not async.
        std::thread::spawn(move || {
            let mut buf = [0u8; 4096];

            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        let text = String::from_utf8_lossy(&buf[..n]).to_string();
                        let _ = app_handle.emit(
                            "comparator://output",
                            PanelOutput {
                                comparison_id: comp_id_clone.clone(),
                                panel_id: panel_id_clone.clone(),
                                stream: "stdout".to_string(),
                                data: text,
                            },
                        );
                    }
                    // EIO or other error means the PTY master is gone (child exited).
                    Err(_) => break,
                }
            }

            let exit_code = child
                .wait()
                .ok()
                .map(|s| s.exit_code() as i32);
            let duration = started.elapsed().as_millis() as u64;

            let _ = app_handle.emit(
                "comparator://complete",
                PanelComplete {
                    comparison_id: comp_id_clone.clone(),
                    panel_id: panel_id_clone.clone(),
                    exit_code,
                    duration_ms: duration,
                },
            );

            {
                let st = app_handle.state::<ComparatorState>();
                if let Ok(mut killers) = st.killers.lock() {
                    killers.remove(&key_clone);
                };
            }
        });
    }

    Ok(())
}

#[tauri::command]
pub async fn kill_panel(
    state: State<'_, ComparatorState>,
    comparison_id: String,
    panel_id: String,
) -> Result<(), String> {
    let key = format!("{}:{}", comparison_id, panel_id);
    let mut killers = state.killers.lock().map_err(|e| e.to_string())?;

    if let Some(mut killer) = killers.remove(&key) {
        killer.kill().map_err(|e| format!("Failed to kill process: {e}"))?;
    }

    Ok(())
}

// ── Helpers ─────────────────────────────────────────────────

fn build_command_args(
    harness_id: &str,
    prompt: &str,
    model: Option<&str>,
) -> Result<(&'static str, Vec<String>), String> {
    match harness_id {
        "claude" => {
            let mut args = vec!["-p".to_string(), prompt.to_string()];
            if let Some(m) = model {
                args.push("--model".to_string());
                args.push(m.to_string());
            }
            Ok(("claude", args))
        }
        "cursor" => {
            let mut args = vec!["agent".to_string(), "-p".to_string(), "--trust".to_string()];
            if let Some(m) = model {
                args.push("--model".to_string());
                args.push(m.to_string());
            }
            args.push(prompt.to_string()); // positional — must be last
            Ok(("cursor", args))
        }
        "gh-copilot" => {
            let mut args = vec!["-p".to_string(), prompt.to_string()];
            if let Some(m) = model {
                args.push("--model".to_string());
                args.push(m.to_string());
            }
            Ok(("copilot", args))
        }
        _ => Err(format!("Unknown harness: {}", harness_id)),
    }
}

// ── Tests ────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::build_command_args;

    #[test]
    fn claude_basic() {
        let (cmd, args) = build_command_args("claude", "hello world", None).unwrap();
        assert_eq!(cmd, "claude");
        assert_eq!(args, vec!["-p", "hello world"]);
    }

    #[test]
    fn claude_with_model() {
        let (cmd, args) = build_command_args("claude", "hi", Some("claude-opus-4-6")).unwrap();
        assert_eq!(cmd, "claude");
        assert_eq!(args, vec!["-p", "hi", "--model", "claude-opus-4-6"]);
    }

    #[test]
    fn copilot_basic() {
        let (cmd, args) = build_command_args("gh-copilot", "write a loop", None).unwrap();
        assert_eq!(cmd, "copilot");
        assert_eq!(args, vec!["-p", "write a loop"]);
    }

    #[test]
    fn copilot_with_model() {
        let (cmd, args) = build_command_args("gh-copilot", "refactor", Some("gpt-4o")).unwrap();
        assert_eq!(cmd, "copilot");
        assert_eq!(args, vec!["-p", "refactor", "--model", "gpt-4o"]);
    }

    #[test]
    fn cursor_basic() {
        let (cmd, args) = build_command_args("cursor", "explain this", None).unwrap();
        assert_eq!(cmd, "cursor");
        assert_eq!(args, vec!["agent", "-p", "--trust", "explain this"]);
    }

    #[test]
    fn cursor_with_model() {
        let (cmd, args) = build_command_args("cursor", "test", Some("gpt-4o")).unwrap();
        assert_eq!(cmd, "cursor");
        assert_eq!(args, vec!["agent", "-p", "--trust", "--model", "gpt-4o", "test"]);
    }

    #[test]
    fn unknown_harness_errors() {
        let result = build_command_args("vscode-copilot", "hi", None);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Unknown harness"));
    }
}
