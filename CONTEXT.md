# HarnessKit

Cross-harness configuration management: one place to see, compare, and reconcile the AI-coding-agent configuration on a machine, backed by the harness-agnostic Harness Protocol (harness.yaml).

## Language

**Harness**:
An AI coding agent product that reads local configuration (Claude Code, Codex, Cursor, pi, OpenCode, Copilot).
_Avoid_: agent (reserved for subagents), tool, IDE

**Surface**:
One installation form of a harness with its own config store — Claude Code and Claude Desktop are different surfaces of the same product, while the ChatGPT desktop app, Codex CLI, and Codex IDE extension are one surface (shared `~/.codex/config.toml`). The unit of comparison: each surface gets its own column in the grid.
_Avoid_: platform, target (legacy code term), app

**Resource**:
The generic diffable unit of configuration on a surface — an MCP server, skill, plugin, instruction block, permission, hook, subagent, model config, or env declaration. Each row in the grid is a resource.
_Avoid_: setting, config item, entry

**Plugin**:
A packaged, versioned bundle of skills/MCP servers/agents in the Claude Code plugin model (now standardizing as Agent Plugins), installed from a marketplace. HarnessKit supports installing plugins as such into any harness.
_Avoid_: extension, add-on

**Profile**:
A harness-agnostic declaration of desired resources (harness.yaml) that compiles to any surface.

**Baseline profile**:
A team-shared profile in a git repo that individuals extend; a machine is diffed against it to surface "you're missing what the rest of us have."
_Avoid_: org rollout (that's the registry-pushed mechanism)

**Scope**:
The layer a resource lives at: organization → personal (user/global) → project → session. Nearest wins. Both personal and project scopes are read-write.

**Agent prompt**:
The third action surface: a generated, copy-pasteable prompt the user pastes into a harness so its own agent applies the change. Offered for every action; the primary path where direct file writes are unsupported.
_Avoid_: recipe, instruction snippet
