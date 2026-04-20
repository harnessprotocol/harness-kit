---
title: Board
---

# Board

The Board is a Kanban task manager built for AI-first workflows. Tasks live in
a YAML file on your machine, served by a local HTTP and WebSocket server. No
cloud account, no sync service — the board is always available and fully
offline.

The Board is also the control surface for the **agent execution engine**: each
card can be handed to an autonomous AI agent that works through the task in
five structured phases and streams live progress back to the card in real time.

## Projects and Epics

Tasks are organized into projects. Each project contains epics — named groups
that map to larger themes or milestones. When you have two or more projects, a
tab bar appears at the top of the board so you can switch between them.

Epics have a status (`active`, `completed`, or `archived`). Only active epics
appear in the task creation form by default.

## Columns

The board uses six columns that reflect the full AI-native task lifecycle:

| Column | Meaning |
|--------|---------|
| **Backlog** | Ideas and future work (collapsed by default) |
| **Planning** | Tasks being scoped, designed, or assigned |
| **In Progress** | Actively being worked on |
| **AI Review** | Agent has finished — ready for automated review |
| **Human Review** | Waiting for a person to sign off |
| **Done** | Complete |

A seventh visual state, **Blocked**, can be set on any task regardless of
column — the card renders a red badge and an optional reason string.

Column collapsed state persists to localStorage. Dragging a task onto a
collapsed column expands it automatically.

## Views

Toggle between two views using the control in the header:

- **Columns** — the classic kanban layout, one column per status
- **Swimlanes** — rows grouped by epic, each row containing status columns

The selected view is saved and restored on next open.

## Drag and Drop

Drag any task card to move it to a different column. You can drop onto the
column header, onto the empty space within a column, or onto another card. The
board resolves the target status from whichever droppable element you land on.

## Task Detail

Click any card to open the task detail panel. From there you can:

- Edit title, description, status, and epic assignment
- Set priority, category, and complexity
- See linked GitHub issues (requires `repo_url` on the project)
- View agent execution state, subtask progress, and the thought/tool event log
- Start, pause, resume, or steer an agent run

## Agent Execution

Each task can be handed to an autonomous agent. The agent runs a five-phase
LangGraph pipeline — spec → planning → coding → QA review → QA fixing — on
your local machine and streams live progress back to the card in real time.

<AgentExecutionDiagram />

### How execution starts

When you click **Start** on a task, the desktop app sends a `POST` to the
agent-server at port 4802. The agent-server starts a LangGraph run and
immediately returns `{ ok: true }`. Progress streams over WebSocket — the
board never blocks waiting for completion.

**Task-level settings** affect how the agent runs:

| Setting | Where to set it | Effect |
|---------|-----------------|--------|
| `default_model` | Task detail → Settings | Which Claude model the agent uses (default: claude-opus-4-6) |
| `default_harness` | Task detail → Settings | Which harness config the agent loads |
| `no_worktree` | Task detail → Settings | Skip worktree creation; agent works in the project root |

If `no_worktree` is not set, the board-server creates a git worktree at
`.worktrees/<task-id>` so the agent's file changes are isolated from your
main branch.

### The task card as a live surface

While an agent is running, the card shows:

- **Phase dot** — a colored pulsing dot labeled with the current phase
  (Spec · Planning · Coding · QA Review · QA Fix)
- **Progress bar** — advances as the pipeline moves through phases
  (8% → 20% → 65% → 85% → 92% → 100%)
- **Subtask stream** — subtasks appear on the card as the planning phase writes
  them to the board; check marks fill in as each one is completed
- **Event log** — in the task detail panel, a live feed of agent thoughts and
  tool calls (reads, writes, edits, bash runs, board updates)

### Execution controls

| Control | Behavior |
|---------|----------|
| **Start** | Begins a new agent run from the spec phase |
| **Stop** | Terminates the run permanently; cannot be resumed. Completed phases remain checkpointed but the run is abandoned. |
| **Pause** | Aborts the running graph; SQLite checkpoint preserves state for later resumption |
| **Resume** | Re-streams from the last checkpoint; no re-running of completed phases |
| **Steer** | Injects a free-text instruction and immediately resumes — steer is steer + resume in one operation; no separate Resume call needed |

You must pause before steering. The steer endpoint rejects requests while the
graph is active.

For a full technical breakdown of the five phases, event stream schema,
security model, and pause/resume semantics, see
[Agentic Task Execution](/docs/concepts/agentic-task-execution).

## Data Model

Board data lives at `~/.harness/board/projects/<slug>.yaml`. The structure:

```
Project
├── name, slug, description, color, repo_url
├── default_harness, default_model, max_concurrent
└── epics[]
     ├── id, name, description, status
     └── tasks[]
          ├── id, title, description, status, priority, category, complexity
          ├── branch, worktree_path, linked_commits, no_worktree
          ├── default_harness, default_model
          ├── subtasks[]  { id, title, status, files, phase }
          ├── comments[]  { author, timestamp, body }
          └── execution   { status, phase, started_at, finished_at, exit_code }
```

The `execution.status` field tracks the agent run lifecycle:
`idle → running → paused → completed | failed | stopped`.

> **Gotcha:** Task titles or descriptions that contain `: ` (colon + space)
> can corrupt the YAML file — the YAML parser treats the sequence as a key
> separator. Use `—` (em dash) or rephrase to avoid colon-space in
> user-supplied text.

## Connection Status

The header shows a live connection indicator. If the board server goes offline,
the header displays an **Offline** state with a **Restart** button — you can
recover without restarting the full app.

The title bar health dot reflects the board server's status globally. Click it
to open the **Services** page, which shows all four background servers (Board
:4800, Agent :4802, Chat Relay :4801, Membrain) and lets you restart any
individually.

## Related

- [Agentic Task Execution](/docs/concepts/agentic-task-execution) — deep dive into
  the five-phase pipeline, event stream, pause/resume, and security model
- [Roadmap](/docs/apps/roadmap) — AI-generated quarterly roadmap with features
  that convert directly into board tasks
- [board plugin](/docs/plugins/productivity/board) — the MCP plugin that lets
  Claude Code interact with the board from a terminal session
