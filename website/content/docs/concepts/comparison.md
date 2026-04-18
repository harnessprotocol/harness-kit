---
sidebar_position: 3
title: Where harness-kit fits
---

# Where harness-kit fits

AI tooling has many layers. harness-kit operates at the configuration layer: it describes how an agent is set up, not how it communicates or what it's built on.

## The layers

| Layer | What it solves | Example |
|-------|---------------|---------|
| **Configuration** | How is this agent set up? | harness-kit, Harness Protocol |
| **Tool communication** | How does the agent call external tools? | MCP (Model Context Protocol) |
| **Runtime communication** | How do running agents talk to each other? | A2A (Agent-to-Agent Protocol) |
| **Developer SDK** | How do I build an agent-powered application? | Claude Agent SDK, OpenAI SDK |

These layers compose. They don't compete. A `harness.yaml` can declare MCP servers, the agent uses the Claude SDK internally, and could speak A2A to coordinate with other agents. No conflicts.

---

## A2A (Agent-to-Agent Protocol)

[A2A](https://a2aproject.github.io/A2A/) is an open protocol for communication between running agents. Agents discover each other's capabilities via Agent Cards, delegate tasks, stream results, and collaborate without exposing internal state.

harness-kit doesn't do runtime communication. It defines the agent's environment before it starts running. If your agent speaks A2A to coordinate with other agents, harness-kit is what configured the agent in the first place.

| | A2A | harness-kit |
|---|---|---|
| **When it runs** | At runtime, between live agents | At session start, before the agent does anything |
| **What it defines** | Task lifecycle, message format, capability discovery | Plugin configuration, MCP servers, instructions, permissions |
| **Question answered** | How does Agent A delegate work to Agent B? | How is this agent configured to do its job? |

> A2A is HTTP for agents. harness-kit is the Dockerfile.

---

## Claude Agent SDK

The [Claude Agent SDK](https://docs.anthropic.com/en/docs/agents) is Anthropic's toolkit for building applications powered by Claude: tool use, multi-turn conversation, agent orchestration. It's a developer API. You write code against it.

harness-kit doesn't help you build agent applications. It helps you configure the AI coding tools you already use. You don't write code to use harness-kit. You write a YAML file and install plugins.

| | Claude Agent SDK | harness-kit |
|---|---|---|
| **Primary user** | App developer building a Claude-powered product | Developer using Claude Code as a coding assistant |
| **What you write** | Python/TypeScript application code | `harness.yaml` configuration files |
| **What it manages** | API calls, tool schemas, conversation state | Plugins, MCP servers, instructions, permissions |
| **Question answered** | How do I program an agent to do X? | How do I configure my AI environment to work the way I want? |

> The Claude SDK is how you build an agent. harness-kit is how you set one up.

---

## MCP (Model Context Protocol)

MCP gives your AI agent new capabilities: database access, file systems, web search, external APIs. Each MCP server exposes tools the agent can call.

harness-kit is about what to do with those tools. A `harness.yaml` can declare which MCP servers to connect, but the workflows (plugins, skills) are what turn raw tool access into repeatable processes.

| | MCP | harness-kit |
|---|---|---|
| **What it provides** | Tools the agent can call (read file, query database, search web) | Workflows that use those tools (code review, research, data lineage) |
| **What you configure** | Server transport, command, arguments | Plugins, skills, instructions, permissions |
| **Question answered** | How does my agent access external systems? | What does my agent do with that access? |

> MCP gives your agent hands. harness-kit gives it a playbook.

---

## ACP (Agent Client Protocol)

ACP standardizes the runtime protocol between code editors and AI coding agents — the
same role LSP plays for language tooling. Where harness-kit handles *configuration*
(which plugins, skills, and MCP servers an agent loads), ACP handles *runtime protocol*
(how the editor and agent exchange messages during a session).

| | ACP | harness-kit |
|---|---|---|
| **Layer** | Runtime protocol | Configuration/startup |
| **What it standardizes** | JSON-RPC message exchange | harness.yaml format |
| **When it runs** | During active sessions | Before/during session setup |

These layers compose: ACP-compatible agents benefit from harness-kit configuration
the same way any agent does. The comparator identifies ACP-compatible harnesses — full
structured event exchange is in development.

---

## devenv

If you've used [devenv](https://devenv.sh), harness-kit will feel familiar.

devenv declares a reproducible development environment (packages, languages, services) and carries that setup across machines and teammates. harness-kit does the same thing for AI workflows: declare the plugins, install them once, and they follow you everywhere.

| Concept | devenv | harness-kit |
|---------|--------|-------------|
| Portable | `devenv.nix` travels with your repo | Plugins install by name, follow you everywhere |
| Declarative | Specify what you need; the tool resolves it | Specify which plugins; the harness loads them |
| Composable | Combine modules and inputs | Mix and match plugins per project |
| Shareable | Commit config, team gets same environment | Share a plugin name, team runs same workflow |

devenv manages your shell environment: the packages, runtimes, and services your code needs to run. harness-kit manages your AI agent environment: the skills, workflows, and behaviors your harness needs to be useful.

devenv answers: *"How do I make sure every developer has the same Node version and Postgres instance?"*

harness-kit answers: *"How do I make sure every session has the same code review workflow and research process?"*

They operate at different layers and compose naturally.

---

## Can I use all of these together?

Yes. A typical setup might look like:

- **harness-kit** configures your Claude Code environment (plugins, MCP servers, instructions)
- **ACP** standardizes how your editor communicates with the agent during a session
- **MCP** connects your agent to databases, file systems, and APIs
- **Claude SDK** powers the agent under the hood
- **A2A** lets your agent coordinate with other agents at runtime
- **devenv** makes sure your OS-level toolchain is reproducible

Each layer does one thing. None of them replace each other.
