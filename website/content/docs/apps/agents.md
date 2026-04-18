---
title: Agents
---

# Agents

The Agents page is a detection panel for AI coding agents installed on your machine.
It scans your `PATH` and known install locations for supported CLI agents and shows
their installation status, version, and protocol.

## Detected Agents

The page auto-detects the following agents:

| Agent | Binary |
|-------|--------|
| Claude Code | `claude` |
| OpenAI Codex | `codex` |
| GitHub Copilot CLI | `gh copilot` |
| Cursor | `cursor-agent` |
| OpenCode | `opencode` |
| Goose | `goose` |
| Gemini CLI | `gemini` |
| Aider | `aider` |
| Amazon Q Developer | `q` |
| Warp | `warp-agent` |
| Open Interpreter | `interpreter` |
| Cline | `cline` |
| Forge | `forge` |
| Qwen Code | `qwen-coder` |

Each card shows the agent name, binary path, description, protocol (stdio or http),
and install status. If a version is detected, it is shown on the installed badge.

## Protocol Badges

Each agent is tagged with its communication protocol:

- **stdio** — communicates over standard input/output; the harness spawns the process
  and reads its stream
- **http** — communicates over a local HTTP server; the harness connects to a
  running process

## Add to Comparator

Installed agents can be added to the Comparator from this page. Click
**Add to Comparator** on any installed agent card to stage it for the next evaluation
run. The button is disabled for agents that are not installed.

## Install Links

For agents that are not installed, each card shows a **How to install** link that
opens the agent's official documentation in your browser.
