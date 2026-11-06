---
title: Comparator
---

# Comparator

The Comparator is a four-phase evaluation workbench for comparing AI harnesses
side-by-side on the same task.

> Comparator lives behind **Settings › Labs** and is off by default. Enable it
> there to add it to the sidebar and the `Cmd+K` command palette.

## When to Use It

Use the comparator when you want data-driven answers to: "Does Claude Code with my
current harness configuration perform better on this kind of task than an alternative
setup?" Run the same prompt against multiple harnesses and compare the approaches,
outputs, and outcomes.

## Phases

### 1. Setup

Configure which harnesses to compare and define the evaluation task. Available harnesses
are auto-detected on your system. Harnesses marked **ACP** are ACP-compatible agents.
Once full ACP transport is enabled, they exchange structured JSON-RPC events during
execution rather than raw terminal output.

### 2. Execution

Live in-app execution is not available in this build. The Comparator cannot start
runs. Run each harness yourself, then record the results here for review and scoring.

### 3. Results

Review file diffs side by side. See which harness produced which changes and compare
the approaches taken. Panel headers show duration, exit code, and protocol mode.

### 4. Judge

Score each harness across evaluation dimensions. Default dimensions:

- Code quality
- Correctness
- Completeness
- Performance
- Readability
- Error handling

Add custom dimensions for your specific evaluation needs. Scores are recorded and used
to build per-harness win rates over time — the comparator will recommend harnesses based
on historical performance for each task type.

## ACP Compatibility

Harnesses marked **ACP** implement the [Agent Client Protocol](/docs/concepts/agent-client-protocol),
which standardizes the editor↔agent communication layer. ACP-compatible harnesses:

- Are discoverable through the [ACP registry](https://agentclientprotocol.com/overview/agents)
- Support capability negotiation at session start
- Will emit structured session events (plans, tool calls, message chunks, stop reasons) once full ACP transport is enabled

Claude Code is ACP-compatible.
