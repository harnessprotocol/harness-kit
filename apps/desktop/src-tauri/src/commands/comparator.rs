use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Instant;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandChild;

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
    pub children: Mutex<HashMap<String, CommandChild>>,
}

impl Default for ComparatorState {
    fn default() -> Self {
        Self {
            children: Mutex::new(HashMap::new()),
        }
    }
}

// ── Known harnesses ─────────────────────────────────────────

struct HarnessDef {
    id: &'static str,
    name: &'static str,
    command: &'static str,
    version_args: &'static [&'static str],
}

const KNOWN_HARNESSES: &[HarnessDef] = &[
    HarnessDef {
        id: "claude",
        name: "Claude Code",
        command: "claude",
        version_args: &["--version"],
    },
    HarnessDef {
        id: "cursor",
        name: "Cursor",
        command: "cursor",
        version_args: &["--version"],
    },
    HarnessDef {
        id: "gh-copilot",
        name: "GitHub Copilot",
        command: "gh",
        version_args: &["--version"],
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
                results.push(HarnessInfo {
                    id: def.id.to_string(),
                    name: def.name.to_string(),
                    command: def.command.to_string(),
                    available: true,
                    version: if version.is_empty() { None } else { Some(version) },
                    mode: Some("supported".to_string()),
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

        // Build args based on harness type
        let (cmd_name, args) = build_command_args(
            &panel.harness_id,
            &request.prompt,
            panel.model.as_deref(),
        )?;

        let shell = app.shell();
        let cwd = panel.working_dir.as_deref().unwrap_or(&request.working_dir);
        let command = shell
            .command(cmd_name)
            .args(args)
            .current_dir(cwd)
            .envs([("FORCE_COLOR", "1"), ("CLICOLOR_FORCE", "1")]);

        let (mut rx, child) = command
            .spawn()
            .map_err(|e| format!("Failed to spawn {}: {}", panel.harness_id, e))?;

        // Store child for kill support
        {
            let mut children = state.children.lock().map_err(|e| e.to_string())?;
            children.insert(key.clone(), child);
        }

        // Spawn async reader task
        let app_handle = app.clone();

        let panel_id_clone = panel_id.clone();
        let comp_id_clone = comp_id.clone();
        let key_clone = key.clone();
        let started = Instant::now();

        tauri::async_runtime::spawn(async move {
            use tauri_plugin_shell::process::CommandEvent;

            while let Some(event) = rx.recv().await {
                match event {
                    CommandEvent::Stdout(data) => {
                        let text = String::from_utf8_lossy(&data).to_string();
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
                    CommandEvent::Stderr(data) => {
                        let text = String::from_utf8_lossy(&data).to_string();
                        let _ = app_handle.emit(
                            "comparator://output",
                            PanelOutput {
                                comparison_id: comp_id_clone.clone(),
                                panel_id: panel_id_clone.clone(),
                                stream: "stderr".to_string(),
                                data: text,
                            },
                        );
                    }
                    CommandEvent::Terminated(payload) => {
                        let duration = started.elapsed().as_millis() as u64;
                        let _ = app_handle.emit(
                            "comparator://complete",
                            PanelComplete {
                                comparison_id: comp_id_clone.clone(),
                                panel_id: panel_id_clone.clone(),
                                exit_code: payload.code,
                                duration_ms: duration,
                            },
                        );

                        // Clean up stored child
                        let state = app_handle.state::<ComparatorState>();
                        if let Ok(mut children) = state.children.lock() {
                            children.remove(&key_clone);
                        }
                        break;
                    }
                    CommandEvent::Error(err) => {
                        let _ = app_handle.emit(
                            "comparator://output",
                            PanelOutput {
                                comparison_id: comp_id_clone.clone(),
                                panel_id: panel_id_clone.clone(),
                                stream: "stderr".to_string(),
                                data: format!("Error: {}", err),
                            },
                        );
                    }
                    _ => {}
                }
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
    let mut children = state.children.lock().map_err(|e| e.to_string())?;

    if let Some(child) = children.remove(&key) {
        child.kill().map_err(|e| format!("Failed to kill process: {}", e))?;
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
            let mut args = vec!["--prompt".to_string(), prompt.to_string()];
            if let Some(m) = model {
                args.push("--model".to_string());
                args.push(m.to_string());
            }
            Ok(("cursor", args))
        }
        "gh-copilot" => {
            let args = vec![
                "copilot".to_string(),
                "suggest".to_string(),
                prompt.to_string(),
            ];
            Ok(("gh", args))
        }
        _ => Err(format!("Unknown harness: {}", harness_id)),
    }
}
