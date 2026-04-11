use std::process::Command;
use tokio::time::{timeout, Duration};

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

#[tauri::command]
pub async fn detect_agents() -> Result<Vec<AgentInfo>, String> {
    let mut results = Vec::with_capacity(KNOWN_AGENTS.len());

    for def in KNOWN_AGENTS {
        let installed = which(def.binary);
        let version = if installed {
            // 3-second timeout to avoid hanging on misbehaving binaries
            let binary = def.binary.to_string();
            let version_result = timeout(
                Duration::from_secs(3),
                tokio::task::spawn_blocking(move || get_version(&binary)),
            )
            .await;

            match version_result {
                Ok(Ok(v)) => v,
                _ => None,
            }
        } else {
            None
        };

        let already_in_comparator = BUILTIN_HARNESS_IDS.contains(&def.id);

        results.push(AgentInfo {
            id: def.id.to_string(),
            name: def.name.to_string(),
            binary: def.binary.to_string(),
            installed,
            version,
            protocol: def.protocol.to_string(),
            description: def.description.to_string(),
            add_to_comparator: !already_in_comparator && installed,
        });
    }

    Ok(results)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detect_agents_returns_all_known_agents() {
        // We can't invoke the async command in a unit test without a Tauri context,
        // but we can verify the static definition list has the expected number of entries.
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
        // binary that doesn't exist → which() returns false → version is None
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
}
