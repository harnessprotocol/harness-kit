use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Command;
use tokio::task::JoinSet;
use tokio::time::{timeout, Duration};

// ── Agent discovery types ────────────────────────────────────

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AgentInfo {
    pub id: String,
    pub name: String,
    pub binary: String,
    pub installed: bool,
    pub version: Option<String>,
    pub protocol: String,
    pub description: String,
    pub add_to_comparator: bool,
}

struct AgentDef {
    id: &'static str,
    name: &'static str,
    binary: &'static str,
    protocol: &'static str,
    description: &'static str,
}

const KNOWN_AGENTS: &[AgentDef] = &[
    AgentDef {
        id: "claude",
        name: "Claude Code",
        binary: "claude",
        protocol: "stdio",
        description: "Anthropic's official CLI for Claude",
    },
    AgentDef {
        id: "codex",
        name: "Codex CLI",
        binary: "codex",
        protocol: "stdio",
        description: "OpenAI Codex command-line agent",
    },
    AgentDef {
        id: "copilot",
        name: "GitHub Copilot",
        binary: "copilot",
        protocol: "stdio",
        description: "GitHub's AI pair programmer CLI",
    },
    AgentDef {
        id: "cursor-agent",
        name: "Cursor Agent",
        binary: "agent",
        protocol: "stdio",
        description: "Cursor's autonomous coding agent",
    },
    AgentDef {
        id: "opencode",
        name: "OpenCode",
        binary: "opencode",
        protocol: "stdio",
        description: "Open-source terminal AI coding agent",
    },
    AgentDef {
        id: "goose",
        name: "Goose",
        binary: "goose",
        protocol: "stdio",
        description: "Block's open-source AI developer agent",
    },
    AgentDef {
        id: "gemini",
        name: "Gemini CLI",
        binary: "gemini",
        protocol: "stdio",
        description: "Google Gemini command-line agent",
    },
    AgentDef {
        id: "aider",
        name: "Aider",
        binary: "aider",
        protocol: "stdio",
        description: "AI pair programming in your terminal",
    },
    AgentDef {
        id: "amazon-q",
        name: "Amazon Q",
        binary: "q",
        protocol: "stdio",
        description: "Amazon Q Developer CLI agent",
    },
    AgentDef {
        id: "warp",
        name: "Warp",
        binary: "warp",
        protocol: "http",
        description: "AI-native terminal with agent capabilities",
    },
    AgentDef {
        id: "open-interpreter",
        name: "Open Interpreter",
        binary: "interpreter",
        protocol: "stdio",
        description: "Local code interpreter and AI agent",
    },
    AgentDef {
        id: "cline",
        name: "Cline CLI",
        binary: "cline",
        protocol: "stdio",
        description: "Autonomous coding agent with tool use",
    },
    AgentDef {
        id: "forge",
        name: "ForgeCode",
        binary: "forge",
        protocol: "stdio",
        description: "AI-powered software engineering agent",
    },
    AgentDef {
        id: "qwen",
        name: "Qwen Coder",
        binary: "qwen-coder",
        protocol: "stdio",
        description: "Alibaba's Qwen coding model CLI",
    },
];

/// IDs that are already present in the frontend's BUILTIN_HARNESSES list.
/// These agents will have add_to_comparator = false (already there).
const BUILTIN_HARNESS_IDS: &[&str] = &[
    "claude", "codex", "copilot", "cursor-agent", "opencode",
    "goose", "gemini", "aider", "amazon-q", "open-interpreter",
];

fn which(binary: &str) -> bool {
    Command::new("which")
        .arg(binary)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

fn get_version(binary: &str) -> Option<String> {
    let output = Command::new(binary)
        .arg("--version")
        .output()
        .ok()?;

    let raw = if output.stdout.is_empty() {
        String::from_utf8_lossy(&output.stderr).to_string()
    } else {
        String::from_utf8_lossy(&output.stdout).to_string()
    };

    // Extract first non-empty line and trim
    raw.lines()
        .map(|l| l.trim().to_string())
        .find(|l| !l.is_empty())
}

/// Detect all known CLI agents in parallel. All 14 checks run concurrently;
/// worst-case latency is ~3s (the per-agent timeout) rather than 14 × 3s.
#[tauri::command]
pub async fn detect_agents() -> Result<Vec<AgentInfo>, String> {
    let mut set = JoinSet::new();

    for def in KNOWN_AGENTS {
        let id          = def.id.to_string();
        let name        = def.name.to_string();
        let binary      = def.binary.to_string();
        let protocol    = def.protocol.to_string();
        let description = def.description.to_string();
        let already_in  = BUILTIN_HARNESS_IDS.contains(&def.id);

        set.spawn(async move {
            let bin_check = binary.clone();
            let installed = tokio::task::spawn_blocking(move || which(&bin_check))
                .await
                .unwrap_or(false);

            let version = if installed {
                let bin_ver = binary.clone();
                match timeout(
                    Duration::from_secs(3),
                    tokio::task::spawn_blocking(move || get_version(&bin_ver)),
                )
                .await
                {
                    Ok(Ok(v)) => v,
                    _ => None,
                }
            } else {
                None
            };

            AgentInfo {
                id,
                name,
                binary,
                installed,
                version,
                protocol,
                description,
                add_to_comparator: !already_in && installed,
            }
        });
    }

    let mut results = Vec::with_capacity(KNOWN_AGENTS.len());
    while let Some(res) = set.join_next().await {
        if let Ok(info) = res {
            results.push(info);
        }
    }

    results.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(results)
}

// ── Harness health / resilience types ───────────────────────

#[derive(serde::Serialize, serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HarnessHealthRecord {
    pub harness_id: String,
    pub last_exit_code: Option<i32>,
    pub last_failure_at: Option<String>,
    pub consecutive_failures: u32,
    pub total_launches: u64,
}

// ── Harness health helpers ───────────────────────────────────

fn health_file_path() -> Result<PathBuf, String> {
    dirs::home_dir()
        .ok_or_else(|| "Could not resolve home directory".to_string())
        .map(|h| h.join(".harness-kit").join("harness-health.json"))
}

fn read_health_map(path: &PathBuf) -> HashMap<String, HarnessHealthRecord> {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

/// Write atomically: serialise to a .tmp file then rename into place.
/// A mid-write crash leaves the previous health file intact.
fn write_health_map(path: &PathBuf, map: &HashMap<String, HarnessHealthRecord>) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create dir: {}", e))?;
    }
    let json = serde_json::to_string_pretty(map)
        .map_err(|e| format!("Failed to serialize health map: {}", e))?;
    let tmp = path.with_extension("tmp");
    std::fs::write(&tmp, &json)
        .map_err(|e| format!("Failed to write temp health file: {}", e))?;
    std::fs::rename(&tmp, path)
        .map_err(|e| format!("Failed to rename health file: {}", e))
}

// ── Harness health commands ──────────────────────────────────

/// Record the result of a harness launch. Increments consecutive_failures on
/// non-zero exit codes and resets to 0 on success.
#[tauri::command]
pub fn record_harness_launch_result(harness_id: String, exit_code: i32) -> Result<(), String> {
    let path = health_file_path()?;
    let mut map = read_health_map(&path);

    let id = harness_id.clone();
    let record = map.entry(id).or_insert_with(|| HarnessHealthRecord {
        harness_id: harness_id.clone(),
        last_exit_code: None,
        last_failure_at: None,
        consecutive_failures: 0,
        total_launches: 0,
    });

    record.total_launches += 1;
    record.last_exit_code = Some(exit_code);

    if exit_code != 0 {
        record.consecutive_failures += 1;
        record.last_failure_at = Some(
            chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string(),
        );
    } else {
        record.consecutive_failures = 0;
    }

    write_health_map(&path, &map)
}

/// Return health records for all known harnesses. Returns empty vec if no
/// health file exists yet.
#[tauri::command]
pub fn get_harness_health() -> Result<Vec<HarnessHealthRecord>, String> {
    let path = health_file_path()?;
    if !path.exists() {
        return Ok(vec![]);
    }
    let map = read_health_map(&path);
    let mut records: Vec<HarnessHealthRecord> = map.into_values().collect();
    records.sort_by(|a, b| a.harness_id.cmp(&b.harness_id));
    Ok(records)
}

// ── Tests ────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;

    // ── detect_agents tests ──────────────────────────────────

    #[test]
    fn detect_agents_returns_all_known_agents() {
        assert_eq!(KNOWN_AGENTS.len(), 14);
    }

    #[test]
    fn builtin_harness_ids_are_subset_of_known() {
        for id in BUILTIN_HARNESS_IDS {
            assert!(
                KNOWN_AGENTS.iter().any(|a| a.id == *id),
                "BUILTIN_HARNESS_IDS references unknown agent id: {}",
                id
            );
        }
    }

    #[test]
    fn agent_version_parse_handles_missing_binary() {
        let installed = which("__definitely_not_installed_binary__");
        assert!(!installed);
    }

    #[test]
    fn all_agents_have_valid_protocol() {
        for agent in KNOWN_AGENTS {
            assert!(
                agent.protocol == "stdio" || agent.protocol == "http",
                "Agent {} has invalid protocol: {}",
                agent.id,
                agent.protocol
            );
        }
    }

    // ── harness health tests ─────────────────────────────────

    fn with_temp_home<F: FnOnce()>(f: F) {
        let _lock = crate::HOME_LOCK.lock().unwrap_or_else(|p| p.into_inner());
        let tmp = tempfile::TempDir::new().unwrap();
        let prev = env::var("HOME").ok();
        env::set_var("HOME", tmp.path());

        f();

        match prev {
            Some(h) => env::set_var("HOME", h),
            None => env::remove_var("HOME"),
        }
    }

    #[test]
    fn get_harness_health_returns_empty_when_no_file() {
        with_temp_home(|| {
            let result = get_harness_health().unwrap();
            assert!(result.is_empty());
        });
    }

    #[test]
    fn record_creates_file_and_increments_on_failure() {
        with_temp_home(|| {
            record_harness_launch_result("claude".to_string(), 1).unwrap();
            let health = get_harness_health().unwrap();
            assert_eq!(health.len(), 1);
            let rec = &health[0];
            assert_eq!(rec.harness_id, "claude");
            assert_eq!(rec.total_launches, 1);
            assert_eq!(rec.consecutive_failures, 1);
            assert_eq!(rec.last_exit_code, Some(1));
            assert!(rec.last_failure_at.is_some());
        });
    }

    #[test]
    fn record_resets_consecutive_failures_on_success() {
        with_temp_home(|| {
            record_harness_launch_result("codex".to_string(), 1).unwrap();
            record_harness_launch_result("codex".to_string(), 1).unwrap();
            record_harness_launch_result("codex".to_string(), 0).unwrap();

            let health = get_harness_health().unwrap();
            let rec = health.iter().find(|r| r.harness_id == "codex").unwrap();
            assert_eq!(rec.consecutive_failures, 0);
            assert_eq!(rec.total_launches, 3);
            assert_eq!(rec.last_exit_code, Some(0));
        });
    }

    #[test]
    fn record_tracks_multiple_harnesses_independently() {
        with_temp_home(|| {
            record_harness_launch_result("claude".to_string(), 0).unwrap();
            record_harness_launch_result("codex".to_string(), 1).unwrap();

            let health = get_harness_health().unwrap();
            assert_eq!(health.len(), 2);
            let claude = health.iter().find(|r| r.harness_id == "claude").unwrap();
            let codex = health.iter().find(|r| r.harness_id == "codex").unwrap();
            assert_eq!(claude.consecutive_failures, 0);
            assert_eq!(codex.consecutive_failures, 1);
        });
    }
}
