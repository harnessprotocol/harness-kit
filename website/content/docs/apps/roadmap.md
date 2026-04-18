---
title: Roadmap
---

# Roadmap

The Roadmap is a feature planning surface that sits on top of the Board. Each board
project can have one roadmap. The roadmap organizes features into phases, priorities,
and a kanban view, and it connects to a competitor analysis engine.

## Generating a Roadmap

If a project has no roadmap yet, the empty state offers a **Generate** action. The
generation view uses Claude to analyze the project's existing tasks, description, and
optionally competitor data to produce an initial set of phases and features. You can
cancel the generation at any time and start with a blank roadmap instead.

## Views

The roadmap has four tabs:

- **Kanban** — features arranged in swimlane columns by phase, drag-and-drop to
  reorder within or across phases
- **Phases** — a vertical list of phases in defined order, each showing its features;
  from here you can convert a feature directly into a board task
- **Features** — a flat grid of all features regardless of phase or priority
- **Priorities** — a MoSCoW four-quadrant view (Must, Should, Could, Won't)

## Features

Each feature has a title, description, priority, phase assignment, and an optional
set of competitor insight links. Open a feature to see the detail panel, where you can:

- Edit all fields
- Link the feature to competitor pain points discovered in the competitor analysis
- Convert it to a board task — you'll be prompted to pick an epic if the project
  has more than one
- Navigate directly to the created task on the board
- Delete the feature

## Phases

Phases are ordered milestones (e.g., "Q1 2025", "Beta", "GA"). Each phase has a name
and an order index. You can add phases from the header, and the phases view shows
features grouped by phase.

## Competitor Analysis

The roadmap integrates a competitor analysis panel. Add competitors by name and
product URL. The app fetches and summarizes their pain points, feature gaps, and
positioning. These insights become linkable to roadmap features so you know which
competitive pressures drove each decision.

Access the competitor view from the **Competitors** button in the roadmap header.
