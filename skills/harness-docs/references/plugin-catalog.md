# Plugin Catalog

<!-- Source: website/content/docs/plugins/overview.md and individual plugin pages -->

harness-kit ships 17 plugins across 7 categories.

## All Plugins

| Plugin | Category | Slash command | Dependencies |
|--------|----------|---------------|-------------|
| research | Research & Knowledge | `/research` | `gh` CLI (GitHub only), Python 3.10+ |
| orient | Research & Knowledge | `/orient` | None (optional: MCP Memory Server) |
| capture | Research & Knowledge | `/capture` | None |
| membrain | Research & Knowledge | `/memory` | Go 1.25+, membrain MCP server |
| review | Code Quality | `/review` | `gh` CLI (PR review only) |
| rubber-ducky | Code Quality | `/rubber-ducky` | None |
| explain | Code Quality | `/explain` | None |
| lineage | Data Engineering | `/lineage` | None |
| docgen | Documentation | `/docgen` | None |
| open-pr | DevOps | `/open-pr` | `gh` CLI |
| merge-pr | DevOps | `/merge-pr` | `gh` CLI |
| pr-sweep | DevOps | `/pr-sweep` | `gh` CLI, review plugin |
| dependabot-sweep | DevOps | `/dependabot-sweep` | `gh` CLI, `GH_TOKEN` |
| harness-share | Productivity | `/harness-export`, `/harness-import` | None |
| stats | Productivity | `/stats` | Python 3.10+ |
| iterm-notify | Productivity | — (hooks-based) | macOS, iTerm2, terminal-notifier, jq |
| frontend-design | Design | `/frontend-design` | None |

## Plugin Descriptions

### research
Process any source into a structured, compounding knowledge base. Accepts URLs, GitHub repos, YouTube videos, podcast pages, academic papers, local files, PDFs, and Reddit posts. Outputs raw source preservation in `resources/` plus synthesized analysis in `research/[category]/`. Builds a cumulative index across sessions.

### orient
Topic-focused session orientation. Searches across knowledge graph, journal entries, and research index for a given topic, entity, or project. Returns a synthesis of what's known, what's uncertain, and what to read next. Requires context from prior `research` runs or `membrain` entries.

### capture
Capture session information into a staging file for later reflection or knowledge-base integration. Useful for preserving decisions, findings, and context at the end of a working session.

### membrain
Graph-based agent memory. Search, trace, and manage a persistent knowledge graph powered by the membrain MCP server. For teams building AI agents that need to retain context across sessions. Invoked with `/memory`.

### review
Structured code review for branches, PRs, or file paths. Applies severity labels (BLOCKER, WARNING, NIT) and produces a structured report. Works on local branches or GitHub PRs (requires `gh` CLI for PR review by number).

### rubber-ducky
A constructive critic that gives a second opinion on your own plans, designs, code, and tests. Spawns independent read-only reviewers on different Claude models than the one driving the session, to pressure-test in-progress thinking before you commit to it. Distinct from `/review`, which audits a finished diff or PR.

### explain
Layered explanations of code — files, directories, functions, classes, or cross-cutting concepts. Adaptive depth: a single function gets a deep-dive, a directory gets a map first. Project-aware: references `CLAUDE.md` architecture section to ground explanations in the project's own terminology.

### lineage
Column-level data lineage tracing through SQL transformations, Kafka streams, Spark jobs, and JDBC pipelines. Maps how a specific column moves through a data system from source to sink.

### docgen
Generate or update documentation: README, API reference, architecture overview, or changelog. Produces markdown output that matches the project's existing doc conventions.

### open-pr
Pre-flight checks and PR creation workflow. Runs tests, creates the PR, assigns reviewers, and monitors CI status. Requires `gh` CLI.

### merge-pr
Merge a ready pull request. Verifies CI, syncs with base branch, squash merges, cleans up the branch. Requires `gh` CLI.

### pr-sweep
Cross-repository PR sweep. Triages, reviews, merges, or fixes CI across multiple open PRs. Useful for batch PR cleanup sessions. Requires `gh` CLI and the review plugin.

### dependabot-sweep
End-to-end Dependabot remediation. Fetches open alerts via the `gh` CLI, fixes them per ecosystem (pnpm/npm overrides + lockfile regen, cargo update, pip/go/bundler), verifies with audit and frozen-lockfile installs, then branches, commits, pushes, opens a PR, and squash-merges once CI is green. Requires `gh` CLI and a `GH_TOKEN` with repo access.

### harness-share
Compile, export, import, and sync harness configurations across 8 AI coding tools: Claude Code, Cursor, GitHub Copilot, Codex, OpenCode, Windsurf, Gemini CLI, and JetBrains Junie. Key commands: `/harness-export` (write `harness.yaml`), `/harness-import` (apply a `harness.yaml` interactively), `/harness-compile` (generate native config for every target), `/harness-sync` (sync config across tools).

### stats
Interactive HTML dashboard for Claude Code token and session usage. Reads from `~/.claude/projects/` and generates a visual report. Requires Python 3.10+.

### iterm-notify
macOS desktop notifications and iTerm2 badge management for Claude Code events. Hooks-based — fires on session stop. Requires macOS, iTerm2, terminal-notifier, and jq.

### frontend-design
Production-grade frontend design rules covering OKLCH color system, typography, layout, motion, and accessibility. Used as a style guide for UI generation tasks.

## Profiles (Pre-configured Bundles)

| Profile | Who it's for | Plugins included |
|---------|-------------|-----------------|
| research-knowledge | Research-focused roles | research, orient, capture, explain, docgen, membrain |
| data-engineer | Data engineers with SQL pipelines | lineage, research, orient, capture, explain, docgen, review, membrain |
| full-stack-engineer | Full-stack feature shipping | review, open-pr, merge-pr, pr-sweep, explain, docgen, harness-share, membrain |

Install a profile's plugins with `/harness-import` and the profile's YAML.
