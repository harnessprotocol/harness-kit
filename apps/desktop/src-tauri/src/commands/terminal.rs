use portable_pty::{CommandBuilder, MasterPty, PtySize, native_pty_system};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};
use uuid::Uuid;

// ── State ───────────────────────────────────────────────────

pub struct TerminalState {
    pub sessions: Mutex<HashMap<String, TerminalSession>>,
}

pub struct TerminalSession {
    pub writer: Box<dyn Write + Send>,
    pub master: Box<dyn MasterPty + Send>,
    pub killer: Box<dyn portable_pty::ChildKiller + Send + Sync>,
}

impl Default for TerminalState {
    fn default() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
        }
    }
}

// ── Payloads ────────────────────────────────────────────────

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TerminalOutputPayload {
    terminal_id: String,
    data: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TerminalExitPayload {
    terminal_id: String,
    exit_code: Option<u32>,
}

// ── Harness info (returned by detect_harnesses) ─────────────

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

// ── Commands ────────────────────────────────────────────────

/// Return the current working directory of the Tauri process.
#[tauri::command]
pub async fn get_cwd() -> Result<String, String> {
    std::env::current_dir()
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| format!("get_cwd: {e}"))
}

/// Create a new terminal session with the user's login shell.
#[tauri::command]
pub async fn create_terminal(
    app: AppHandle,
    state: State<'_, TerminalState>,
    project_path: String,
) -> Result<String, String> {
    let terminal_id = Uuid::new_v4().to_string();

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("openpty: {e}"))?;

    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
    let mut cmd = CommandBuilder::new(&shell);
    cmd.arg("-l");
    cmd.env("TERM", "xterm-256color");
    cmd.env("FORCE_COLOR", "1");
    cmd.env("CLICOLOR_FORCE", "1");
    if !project_path.is_empty() {
        cmd.cwd(&project_path);
    }

    let mut child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("spawn: {e}"))?;
    drop(pair.slave);

    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("clone_reader: {e}"))?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|e| format!("take_writer: {e}"))?;

    let killer = child.clone_killer();

    // Store session
    {
        let mut sessions = state.sessions.lock().map_err(|e| e.to_string())?;
        sessions.insert(
            terminal_id.clone(),
            TerminalSession {
                writer,
                master: pair.master,
                killer,
            },
        );
    }

    // Reader thread — emits terminal://output and terminal://exit events
    let tid = terminal_id.clone();
    let app_handle = app.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    let _ = app_handle.emit(
                        "terminal://output",
                        TerminalOutputPayload {
                            terminal_id: tid.clone(),
                            data,
                        },
                    );
                }
                Err(_) => break,
            }
        }

        // Child exited — get exit code
        let exit_code = child
            .wait()
            .ok()
            .map(|status| status.exit_code());

        let _ = app_handle.emit(
            "terminal://exit",
            TerminalExitPayload {
                terminal_id: tid.clone(),
                exit_code,
            },
        );

        // Clean up session (state accessed via app handle)
        // Clean up: access managed state via the app handle
        let maybe: Option<tauri::State<TerminalState>> = app_handle.try_state();
        if let Some(st) = maybe {
            if let Ok(mut map) = st.sessions.lock() {
                let map: &mut HashMap<String, TerminalSession> = &mut map;
                map.remove(&tid);
            }
        }
    });

    Ok(terminal_id)
}

/// Destroy a terminal session.
#[tauri::command]
pub async fn destroy_terminal(
    state: State<'_, TerminalState>,
    terminal_id: String,
) -> Result<(), String> {
    let mut sessions = state.sessions.lock().map_err(|e| e.to_string())?;
    if let Some(mut session) = sessions.remove(&terminal_id) {
        session.killer.kill().ok();
    }
    Ok(())
}

/// Write data to a terminal's PTY stdin.
#[tauri::command]
pub async fn write_terminal(
    state: State<'_, TerminalState>,
    terminal_id: String,
    data: String,
) -> Result<(), String> {
    let mut sessions = state.sessions.lock().map_err(|e| e.to_string())?;
    if let Some(session) = sessions.get_mut(&terminal_id) {
        session
            .writer
            .write_all(data.as_bytes())
            .map_err(|e| format!("write: {e}"))?;
        session
            .writer
            .flush()
            .map_err(|e| format!("flush: {e}"))?;
        Ok(())
    } else {
        Err(format!("No terminal session: {}", terminal_id))
    }
}

/// Resize a terminal's PTY dimensions.
#[tauri::command]
pub async fn resize_terminal(
    state: State<'_, TerminalState>,
    terminal_id: String,
    rows: u16,
    cols: u16,
) -> Result<(), String> {
    let sessions = state.sessions.lock().map_err(|e| e.to_string())?;
    if let Some(session) = sessions.get(&terminal_id) {
        session
            .master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("resize: {e}"))?;
        Ok(())
    } else {
        Err(format!("No terminal session: {}", terminal_id))
    }
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

// ── Tests ───────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // ── get_cwd ──────────────────────────────────────────────────

    #[tokio::test]
    async fn get_cwd_returns_valid_path() {
        let result = super::get_cwd().await;
        assert!(result.is_ok());
        let path = result.unwrap();
        assert!(!path.is_empty());
        assert!(std::path::Path::new(&path).is_absolute());
    }

    // ── Serde wire-format tests ──────────────────────────────────
    // These verify that the JSON field names match what the frontend
    // expects. If you rename a Rust field or change serde attributes,
    // these will break — preventing silent mismatches with the JS code.

    #[test]
    fn output_payload_serializes_camel_case() {
        let payload = TerminalOutputPayload {
            terminal_id: "t-1".into(),
            data: "hello".into(),
        };
        let json: serde_json::Value = serde_json::to_value(&payload).unwrap();
        // Frontend reads: event.payload.terminalId, event.payload.data
        assert_eq!(json["terminalId"], "t-1");
        assert_eq!(json["data"], "hello");
        // Ensure snake_case keys do NOT exist
        assert!(json.get("terminal_id").is_none());
    }

    #[test]
    fn exit_payload_serializes_camel_case() {
        let payload = TerminalExitPayload {
            terminal_id: "t-2".into(),
            exit_code: Some(42),
        };
        let json: serde_json::Value = serde_json::to_value(&payload).unwrap();
        // Frontend reads: event.payload.terminalId, event.payload.exitCode
        assert_eq!(json["terminalId"], "t-2");
        assert_eq!(json["exitCode"], 42);
        // Ensure snake_case keys do NOT exist
        assert!(json.get("terminal_id").is_none());
        assert!(json.get("exit_code").is_none());
    }

    #[test]
    fn harness_info_serializes_camel_case() {
        let info = HarnessInfo {
            id: "claude".into(),
            name: "Claude Code".into(),
            command: "claude".into(),
            available: true,
            version: Some("1.0".into()),
            mode: None,
            authenticated: true,
            models: vec!["claude-sonnet-4-6".into()],
            default_model: Some("claude-sonnet-4-6".into()),
        };
        let json: serde_json::Value = serde_json::to_value(&info).unwrap();
        // Frontend reads camelCase: defaultModel, not default_model
        assert_eq!(json["defaultModel"], "claude-sonnet-4-6");
        assert!(json.get("default_model").is_none());
    }
}
