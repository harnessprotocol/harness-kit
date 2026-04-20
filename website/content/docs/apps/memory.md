---
title: Memory
---

# Memory

Memory is a knowledge graph built for AI context. It runs as Membrain — a local
SvelteKit server embedded inside the desktop app. The app proxies all navigation
through an iframe so Membrain's full UI is available without leaving the app.

## Enabling Memory

Memory is a Labs feature and must be enabled before first use. Open the Memory section
and click **Enable** on the preview screen. The Membrain server starts, and the full
interface loads automatically.

## What Membrain Stores

Membrain is a graph-based knowledge store. Nodes represent entities — people,
decisions, conventions, repositories, concepts. Edges represent typed relationships
between them. The graph persists across sessions and across every AI tool on your
machine.

## Sub-pages

Membrain exposes several views, accessible from its own navigation:

- **Graph** — interactive force-directed graph visualization of the full knowledge
  graph; zoom, pan, and click nodes to inspect them
- **Explore** — browse entities by type and search across the graph
- **Entities** — tabular view of all nodes with filtering and editing
- **Knowledge** — structured knowledge base view, organized by domain
- **Context** — the current context window — entities and relationships most
  relevant to your active session
- **Trace** — timeline of all writes to the graph, useful for auditing what was
  added and when
- **Settings** — Membrain configuration and connection details

## Theme Sync

When Membrain starts, the app pushes the current harness-kit color palette to it.
Dark and light mode changes in the app are reflected in Membrain automatically.

## Offline State

If the Membrain server goes offline, the view switches to an offline state with a
restart button. The server can be restarted without restarting the full desktop app.

The title bar health dot reflects the Memory server's status globally. Click it to open
the Services page, which shows all background servers and lets you check or restart
them individually.
