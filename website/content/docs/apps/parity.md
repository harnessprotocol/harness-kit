---
title: Parity
---

# Parity

Parity is a feature comparison matrix for your AI coding harnesses. It shows which
capabilities — config files, settings keys, CLI flags, MCP servers, plugin types —
are supported by each tool installed on your machine, and which ones are actually
present on disk.

## The Capability Grid

The main view is a scrollable grid. Rows are capabilities, grouped into categories.
Columns are harnesses (Claude Code, Cursor, Copilot, etc.). Each cell shows one of
three glyphs:

- `●` (solid dot) — supported and detected on disk
- `○` (ring) — supported by the harness but the file or config is missing
- `—` (dash) — not supported by this harness

Hover over a cell to see the expected file path for that capability.

## Filters

- **Installed only / All harnesses** — toggle to show only harnesses that are
  detected on your machine, or show all known harnesses regardless of availability
- **Category chips** — filter rows to a single category: Config Files, Settings,
  CLI, MCP, Plugins
- **Search** — filter rows by feature name

Right-click a harness column header to hide that column. A chip in the filter bar
shows how many columns are hidden and lets you restore them.

## Scanning

Click **Scan now** to re-probe all harness config files and update the `○`/`●` states.
The scan age is shown next to the button. The initial probe runs automatically on page
load.

## Feature Detail Drawer

Click any row label to open the feature detail drawer. It shows the full description
of the capability, which harnesses support it, and the expected file path per harness.
From the drawer you can batch-select all missing instances of that capability across
harnesses.

## Batch Actions

Select cells in the grid to stage a batch action. The batch action bar appears at the
bottom of the screen with options to generate the missing config or setting across
all selected harnesses at once.

## What's Changed

A collapsible panel at the bottom of the page shows drift detected in the last 30 days —
new features added by a harness that aren't yet in your baseline, or missing files
that were previously present.

Each drift item can be:

- **Acknowledged** — marked as known and dismissed from the active list
- **Created** — for `missing_file` drift, the config file can be created in-place
- **Marked as Known** — for `new_feature` drift, adds it to the parity baseline

Toggle **Show acknowledged** to review items you've already acted on.
