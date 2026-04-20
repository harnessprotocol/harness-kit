---
title: Roadmap
---

# Roadmap

The Roadmap is a feature planning surface that sits on top of the Board. Each
board project can have one roadmap. The roadmap organizes features into phases,
priorities, and a kanban view, and it connects to a competitor analysis engine.

## Generating a Roadmap

If a project has no roadmap yet, the empty state offers a **Generate** action.
You can cancel generation at any time and start with a blank roadmap instead.

### How generation works

Generation runs in three phases, visible in a progress view as it completes:

1. **Analyzing** — reads your board project's existing epics and tasks to
   understand what you've already built and what's in flight
2. **Generating** — calls Claude Opus with a product-strategist system prompt
   and your project context; returns a structured JSON roadmap with 3–4 phases
   and 10–15 features
3. **Saving** — writes the roadmap to disk and loads it into the UI

The generated roadmap includes:

- A **vision statement** (1–2 sentences)
- A **target audience** profile (primary persona, secondary personas, pain
  points, goals, usage context)
- **Phases** ordered logically (foundation → growth → scale, or similar) with
  milestones
- **Features** each with title, description, rationale, MoSCoW priority,
  complexity/impact ratings, user stories, and acceptance criteria

Priority distribution targets: ~40% Must, ~35% Should, ~20% Could, ~5% Won't.

### Authentication

Generation uses the Anthropic API. The system checks credentials in this order:

1. `ANTHROPIC_API_KEY` environment variable
2. Claude Code's stored OAuth token from the macOS Keychain (service
   `Claude Code-credentials` or `Claude Code-credentials-518fa12f`)

If neither is found, or the OAuth token has expired, generation shows an error
with instructions to either set the env var or re-authenticate with
`claude /login`.

## Views

The roadmap has four tabs:

- **Kanban** — features arranged in swimlane columns by phase, drag-and-drop
  to reorder within or across phases
- **Phases** — a vertical list of phases in defined order, each showing its
  features; from here you can convert a feature directly into a board task
- **Features** — a flat grid of all features regardless of phase or priority
- **Priorities** — a MoSCoW four-quadrant view (Must, Should, Could, Won't)

## Features

Each feature has a title, description, priority, phase assignment, and an
optional set of competitor insight links. Open a feature to see the detail
panel, where you can:

- Edit all fields
- Link the feature to competitor pain points discovered in the competitor
  analysis
- **Convert to board task** — creates a task in the chosen epic and sets a
  `linkedFeatureId` back-reference so the feature and task stay connected;
  a link appears on the feature card pointing to the task on the board
- Navigate directly to the created task on the board
- Delete the feature

## Phases

Phases are ordered milestones (e.g., "Q1 2025", "Beta", "GA"). Each phase has
a name, description, order index, and list of milestones. You can add phases
from the header, and the phases view shows features grouped by phase.

## Competitor Analysis

The roadmap integrates a competitor analysis panel that uses AI to summarize
competitive positioning and surface opportunities.

### Adding competitors

Click **Competitors** in the roadmap header, then **Add Competitor**. Provide
a name, product URL, description, and relevance rating (high/medium/low). The
app fetches and analyzes the competitor's public presence.

### What it produces

For each competitor the analysis generates:

| Field | Description |
|-------|-------------|
| **Pain points** | Customer frustrations with this competitor (severity: high/medium/low) |
| **Strengths** | What they do well |
| **Market position** | How they're positioned in the market |

It also synthesizes across competitors:

| Output | Description |
|--------|-------------|
| **Market gaps** | Opportunities none of them address well, with a suggested feature |
| **Insights summary** | Top pain points, differentiator opportunities, market trends |

### Linking insights to features

In the feature detail panel, the **Competitor Insights** section lists pain
points you can attach to the feature. This creates a traceable record of which
competitive pressure drove each product decision.

Features with linked insights show a competitor badge in the feature grid.

### Data model

Competitor and analysis data is stored alongside the roadmap in the board-server.
Each competitor carries a `source` tag (`manual` for ones you added, `ai` for
any AI-suggested competitors) and each pain point carries a severity
(`high`/`medium`/`low`) and opportunity description.

## Related

- [Board](/docs/apps/board) — the Kanban surface where roadmap features become
  tasks
- [Agentic Task Execution](/docs/concepts/agentic-task-execution) — how the
  agent works through board tasks once features are converted
