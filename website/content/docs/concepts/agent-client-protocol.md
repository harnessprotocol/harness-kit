---
title: Agent Client Protocol (ACP)
---

# Agent Client Protocol (ACP)

ACP is an open protocol that standardizes communication between code editors and AI
coding agents — the same role LSP plays for language tooling.

## The Problem It Solves

Before ACP, every editor (VS Code, JetBrains, Zed) had to build a custom integration
for every agent it wanted to support. ACP breaks this N×M problem into N+M: editors
implement ACP once and gain access to all compliant agents; agents implement ACP once
and work across all compliant editors.

## How It Works

ACP runs over JSON-RPC 2.0. Two deployment modes:

- **Local**: agent runs as a subprocess, communication over stdin/stdout
- **Remote**: cloud-hosted agent communicates via HTTP or WebSocket

Sessions start with a capability negotiation handshake (`initialize`), then proceed
through prompt turns:

1. Editor sends `session/prompt` with user content
2. Agent streams `session/update` notifications back: plans, thinking blocks, tool calls, message chunks
3. Agent requests tool permissions from the editor when needed
4. Agent responds with a stop reason: `end_turn`, `max_tokens`, `refusal`, or `cancelled`

## ACP in the harness-kit Comparator

ACP-compatible harnesses (like Claude Code) are marked with an **ACP** badge in the
comparator's Setup and Results phases. Once full ACP transport is implemented, the
execution layer will exchange structured JSON-RPC events instead of parsing raw terminal
output — producing richer, typed activity data for comparison.

## Relationship to MCP

ACP and MCP compose rather than compete:
- **MCP** provides the tools an agent can call
- **ACP** defines how the editor and agent communicate during a session

ACP passes MCP server configurations to the agent at session startup; the agent connects
to those MCP servers directly. ACP can also proxy MCP requests back through the editor.

## harness-kit and ACP

harness-kit operates at the configuration layer — it defines which plugins, skills, MCP
servers, and instructions an agent loads. ACP operates at the runtime layer — how the
editor and agent exchange messages. These are complementary:

- harness-kit configures what an agent has access to
- ACP standardizes how the editor talks to that agent during work

## Resources

- [ACP Documentation](https://agentclientprotocol.com)
- [GitHub: agentclientprotocol/agent-client-protocol](https://github.com/agentclientprotocol/agent-client-protocol)
- [ACP Agent Registry](https://agentclientprotocol.com/overview/agents)
- Official SDKs: [Python](https://github.com/agentclientprotocol/python-sdk) · [TypeScript](https://www.npmjs.com/package/@agentclientprotocol/sdk) · [Rust](https://crates.io/crates/agent-client-protocol) · Kotlin · Java
