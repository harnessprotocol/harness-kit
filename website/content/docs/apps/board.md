---
title: Board
---

# Board

The Board is a Kanban task manager built for AI-first workflows. Tasks live on a server
that runs inside the desktop app, so your board is always local and available without
a cloud account.

## Projects and Epics

Tasks are organized into projects. Each project contains epics — named groups that map
to larger themes or milestones. When you have two or more projects, a tab bar appears
at the top of the board so you can switch between them without leaving the view.

Epics have a status (`active` or `archived`). Only active epics appear in the task
creation form by default, keeping the list focused.

## Columns

The board uses six columns that reflect the full lifecycle of a task:

- **Backlog** — ideas and future work (collapsed by default)
- **Planning** — tasks being scoped or designed
- **In Progress** — actively being worked on
- **Review** — ready for human or agent review
- **Done** — completed
- **Blocked** — stalled, waiting on something external

Column collapsed state is persisted to localStorage. Dragging a task onto a collapsed
column expands it automatically.

## Views

Toggle between two views using the control in the header:

- **Columns** — the classic kanban layout, one column per status
- **Swimlanes** — rows grouped by epic, each row containing status columns

The selected view is saved and restored on next open.

## Drag and Drop

Drag any task card to move it to a different column. You can drop onto the column
header, onto the empty space within a column, or onto another card. The board resolves
the target status from whichever droppable element you land on.

## Task Detail

Click any card to open the task detail panel. From there you can edit the title,
description, status, and epic assignment, and see linked GitHub issues if the project
has a `repo_url` configured.

## Agent Execution

Tasks can be handed off to an agent. The board server communicates with the
`agent-server` (port 4802) to spawn a LangGraph execution run for a given card. Execution
status is shown on the card and in the detail panel in real time.

## Connection Status

The header shows a live connection indicator. If the board server goes offline, the
header will display an **Offline** state and you can restart the server using the
**Restart** button without leaving the board.

The title bar health dot reflects the board server's status globally. Click it to open
the Services page, which shows all background servers and lets you check or restart
them individually.
