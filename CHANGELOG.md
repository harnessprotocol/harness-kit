# Changelog

## 0.2.1 — Unreleased

### Added

- **Desktop: Preferences page** — dedicated `/preferences` route replaces the old popover. Settings: font size (11–18px), density (comfortable/compact), default landing section, hidden sidebar sections, observatory auto-refresh interval, markdown font (sans/mono). All persisted in localStorage with `harness-kit-` prefix.
- **Desktop: Keyboard shortcut** — `Cmd+,` navigates to preferences (standard macOS convention).
- **Desktop: Docs link** — sidebar footer now includes a persistent link to harnesskit.ai/docs (opens in external browser).
- **Desktop: Draggable sidebar resize** — sidebar width is adjustable by dragging and persists across sessions (160–320px range).
- **Desktop: Muted accent colors** — 5 new accent presets: Slate, Sage, Stone, Mauve, Steel.
- **Desktop: Custom title bar** — macOS overlay title bar with collapsible sidebar toggle and back/forward navigation. Traffic lights overlay the web content; the entire bar is a drag region. Keyboard shortcuts: `Cmd+\` toggles the sidebar, `Cmd+[` navigates back, `Cmd+]` navigates forward. Sidebar collapsed state persists across sessions.
- **Desktop: Comparator two-column layout** — setup form now fills available width in a responsive two-column grid (harness selector + directory on the left, prompt on the right). Maximum concurrent harnesses raised from 3 to 4.
- **Desktop: Inline config file editor** — the Settings page now opens `~/.claude/` files in an inline split-pane editor instead of navigating away. File list is filterable by detail level (Essentials / Text Files / All), controlled from Preferences. Unsaved-changes are detected on file switch with an inline discard prompt. Files with a `.md` extension default to preview mode; toggle to editor is per-file. Draggable panel resize persists across sessions.

### Changed

- **Desktop: Observatory typography** — stat and chart card headers use `font-variant-caps: all-small-caps` instead of `text-transform: uppercase`, matching the sidebar and other labels. Area chart fill gradients are subtler (top stop halved); grid lines use `--separator` instead of `--border-base` so data pops more.
- **Desktop: Permissions layout** — Tools, Paths, and Network sections merged into a single unified card with inset section dividers. Allow/Deny/Ask tool rows are stacked vertically with color-coded labels. Preset cards display a colored left border (green for Strict, blue for Standard, amber for Permissive) for at-a-glance identity.
- Renamed `stage` plugin to `capture-session` for clarity — the slash command is now `/capture-session`. The staging file (`session-staging.md`) keeps its name.

### Security

- **Dependencies** — Resolved 8 Dependabot medium-severity alerts: Next.js upgraded to 16.1.7 (fixes HTTP request smuggling in rewrites and unbounded `next/image` disk cache growth), DOMPurify upgraded to 3.3.3 in the desktop app (fixes XSS bypass). Website fumadocs stack updated to core/ui v16.6.17 and mdx v14.2.10 to satisfy Next 16 peer deps.

---

## 0.2.0 — 2026-03-09

### Added

- `plugins/review/` — `/review` skill for structured code review of branches, PRs, and paths. Per-file output with BLOCKER/WARNING/NIT severity labels, cross-file analysis, and overall verdict.
- `plugins/docgen/` — `/docgen` skill for generating or updating README, API docs, architecture overview, and changelog. Always outputs to conversation before writing to disk.
- README redesign — Quick Start section, enhanced plugin table with invocation examples, GitHub Copilot compatibility note, Contributing section.

### Changed

- All plugin versions bumped to `0.2.0`.

---

## 0.1.0 — 2026-03-06

Initial release.

### Added

- `plugins/research/` — `/research` skill for processing any source (URL, GitHub repo, YouTube, PDF, local file) into a structured, compounding knowledge base with index and synthesis files
- `plugins/explain/` — `/explain` skill for layered code explanations: files, directories, functions, classes, and concepts
- `plugins/data-lineage/` — `/data-lineage` skill for tracing column-level data lineage through SQL, Kafka, Spark, and JDBC codebases
- `plugins/orient/` — `/orient` skill for topic-focused session orientation across graph, knowledge, journal, and research
- `plugins/stage/` — `/stage` skill for capturing session information into a staging file for later reflection and knowledge graph processing
- `scripts/rebuild-research-index.py` — regenerates `research/INDEX.md` from synthesis file frontmatter
- `docs/claude-md-conventions.md` — guide to organizing Claude Code config with CLAUDE.md / AGENT.md / SOUL.md separation
- `docs/plugins-vs-skills.md` — rationale for shipping everything as plugins
- `CONTRIBUTING.md` — plugin guidelines, skill conventions, PR process
