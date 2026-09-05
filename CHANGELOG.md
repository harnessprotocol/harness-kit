# Changelog

## Unreleased

### Breaking

- **`harness-kit sync` is now cross-surface resource sync; plugin installation moved to `harness-kit install`.** The two grammars share no flags — the old verb took only `--frozen`/`--locked`, the new one takes `--from/--to/--only/--scope/--dry-run/--yes` — and bare `sync` now *reports* and writes nothing, so an existing scripted `harness-kit sync` prints a gap report instead of installing rather than doing something unexpected. `sync --frozen`/`--locked` error with the mapping to `install`. No deprecation alias: there is no silent-behavior-change path for one to protect against.
- **CLI requires Node ≥ 24** — the machine state store uses the built-in `node:sqlite` (no native dependencies).
- **`TargetPlatform` → `SurfaceId`** — the unit of configuration is now the install *surface*; the only renamed id is `copilot` → `copilot-vscode`. v2 `harness.yaml` files auto-migrate in memory when parsed (with warnings); `harness-kit migrate --write` persists the rename; retired `--target` names error with the mapping.

### Added

- **Harness Protocol v2.1** — `vendor` blocks keyed by surface ids; the legacy `copilot` key stays valid on v2 documents and is rejected on v2.1 with an actionable message.
- **Surface registry: 11 surfaces** — Claude Code, Claude Desktop, Copilot (VS Code), Copilot CLI, Codex (one surface: the ChatGPT app, Codex CLI, and IDE extension share `~/.codex/config.toml`), Cursor, pi (now a detectable first-class surface), OpenCode, plus windsurf/gemini/junie at existing fidelity.
- **Machine observation engine** — reads native config at user *and* project scope per surface, normalizes resources into secret-sanitized canonical forms with identity digests (same logical MCP server digests identically across surfaces; secret rotation is never drift), and computes the machine inventory: an 11-surface × resource grid with gaps and structured diffs.
- **CLI** — `harness-kit status` gains a Machine section (and records snapshot history to `~/.harness/harness.db`, degrading gracefully when unavailable); new `harness-kit diff --from <surface> --to <surface> [--only kind[:name]]`; new `harness-kit migrate [--write]`; `detect` reports non-compile surfaces.
- **Desktop: Machine view** — the new home screen (⌘1): all 11 surfaces family-grouped with per-resource cells (present / absent / not applicable / needs-confirmation), a diff drawer, and skipped-diagnostic reporting. Read-only in this release — one-click sync arrives next.
- **Definitions bundle format v1** — groundwork for remotely-updated surface definitions.
- **Cross-surface sync (write milestone).** Every *gap* can be closed three ways: direct apply, the exact `harness-kit sync …` command shown verbatim, or a generated agent prompt that instructs the target harness's own agent. Tier-one kinds this release are `mcp-server`, `skill`, and `instructions`; other kinds offer the CLI command and prompt but not direct apply, and plugin cells wait for the M3 broker. Rows that exist everywhere but *differ* are reported as diffs and do not yet offer actions — that lands with the rest of AC-11 in M3.
- **Plugin and marketplace inventory.** The Machine grid now has live plugin rows: HarnessKit reads Claude Code's `~/.claude/plugins/installed_plugins.json` and `known_marketplaces.json`, and Codex's `[plugins."name@marketplace"]` and `[marketplaces.ID]` tables in `~/.codex/config.toml`. Both use the same `name@marketplace` identity, so a plugin installed on both surfaces lands on one row and a plugin enabled on one but disabled on the other shows as a diff. Claude Code's install file is user-scoped but records project-local installs too; each install is attributed to its own scope and project installs are filtered to the project being observed. Enable/disable state is read from where Claude Code actually keeps it — the `enabledPlugins` map in settings — because `claude plugin disable` never touches the install record. Three properties of that map were verified against `claude plugin list` with an isolated config dir rather than inferred from the file's shape: an **absent key means disabled**; it is **one map, not one per install scope** (a project settings file disables a user-scope install); and `~/.claude/settings.local.json` is **not consulted** at all, though the project-level one is. Precedence is user `settings.json` → project `settings.json` → project `settings.local.json`. Version and commit are read and shown but deliberately excluded from the comparison digest — Codex records neither, so digesting them would mark every cross-surface plugin row as differing. Copilot CLI, Copilot (VS Code), and Cursor have no verified on-disk plugin state and stay "unmanaged locally" rather than getting guessed-at readers. `status` lists each surface's registered marketplaces; the grid badges them, where a badge reading `0` means "none registered" and no badge means "cannot be read". Marketplace paths under home are recorded as `~/…` so no username travels with inventory, and marketplace URLs are run through the same credential sanitizer MCP URLs get — a private marketplace is routinely added as `https://user:token@host/repo.git`, and `harness-kit status --json` is what people paste into bug reports.
- Plugin cells are actionable but not directly writable: they offer the CLI command and agent prompt, and refuse direct apply with a reason naming the surface's own installer as the mechanism. Installing through the broker arrives next.
- **New cell state: `unmanaged`.** A surface that HAS a concept but keeps no store HarnessKit reads for it (Cursor plugins, Windsurf MCP) no longer renders as a blank "absent" cell indistinguishable from a real absence. Like `not-applicable` it is a descriptor fact and never a gap — there is nowhere to copy into.
- **Plugin gaps are filtered to what the target could actually install.** Plugin identity is `name@marketplace` and marketplaces are registered per surface, so a plugin from a marketplace the target has never registered is not one action away — and Codex's bundled marketplaces are local directories inside the ChatGPT app, which no other surface can install from. On a real machine this cut 19 plugin gaps to 5, all reachable. Suppressed only where the target's marketplaces were actually read, and compared case-insensitively to match how row identity joins. `harness-kit diff` and the desktop drawer now take their gaps from the engine rather than recomputing them from cell status, so all three agree and `diff` no longer exits 1 forever on a gap no action can close.

- **User-scope writes with rollback.** `applyFileTransaction` gained *named roots* (`project`/`home`) rather than relaxed path validation: member paths stay root-relative so the existing traversal and symlink guards apply unchanged, and the home root additionally allowlists only the config stores the surface registry declares. Every apply — CLI or desktop — verifies its preimage, backs it up, and writes a rollback manifest. `harness-kit rollback` gains `--list` (rollback points across both scopes, newest first, degrading to `.harness/state.json` when the state database is unavailable) and accepts a transaction id as well as a manifest path. Applies made from the desktop are recorded in the same ledger, so `--list` shows CLI and app applies together.
- **Codex `~/.codex/config.toml` is now writable** via managed-region editing — HarnessKit owns only the `[mcp_servers.*]` tables it manages, and every other byte survives.
- **Agent prompts** (`harness-kit sync --prompt [--out <path>]`) render secrets as `${HARNESS_*}` references by default; `--reveal-secrets` covers the deliberate local one-paste case and warns inside the prompt body.
- **`HARNESS_STATE_PATH`** overrides the shared state database location (`~/.harness/harness.db` by default). It names the file, not its directory, so several machine-state databases can sit side by side — useful for CI, tests, and running two checkouts against separate state.
- **Loss preview.** When a target cannot fully express a resource, the loss is shown before anything is written and applying requires explicit confirmation (`--yes` in the CLI). A mere shape translation into the surface's native form is reported but does not gate — gating on it would put a prompt in front of nearly every copy.

### Changed

- Capability matrix now spans 11 surfaces × 10 resource kinds with `not-applicable` cells (e.g. pi has no MCP concept); website matrix page renders all 11 grouped by product family.
- Desktop Tauri filesystem **read** scope widened to the user-level config paths the grid observes (`~/.claude.json`, Claude Desktop and VS Code application-support paths, `~/.copilot`, `~/.agents`); write scope unchanged.

### Fixed

- **`isWritableFormat` failed open on an unrecognized store format**, contradicting the invariant in its own docblock: an unknown id read as writable, and ids like `toString` resolved to `Object.prototype` members. Since the definitions bundle deliberately treats `formatId` as an open runtime set so a newer format degrades rather than being rejected, a remote bundle (M4) could have named any path and had it admitted to the user-scope write allowlist. The lookup now fails closed.
- **The user-scope write allowlist now derives from *writable* stores, not every declared store.** Teaching the engine to read a new config file no longer widens what a user-scope apply is permitted to touch — a read-only store cannot become writable as a side effect. This also narrowed the existing allowlist: the four `json-generic` permissions files (`.claude/settings.json`, `.copilot/settings.json`, `.cursor/cli-config.json`, `.pi/agent/settings.json`) left it, since that format has no writer and applies to them were already refused a layer earlier.
- **Desktop sync bridge could write anywhere under `$HOME`.** `commands/sync.rs` writes through `std::fs`, bypassing the Tauri fs plugin scope, and never constrained its `project_dir` — so a caller passing `~/` could reach any dotfile through the ordinary relative-path writer. Path traversal was blocked correctly; the *root* was not. All five entry points now resolve through one guard that refuses the home directory and its ancestors.
- **CLI printed a stack trace for every command failure.** `program.parse()` had no error handling, so any async command rejection surfaced as an unhandled rejection. Failures are now one line on stderr with exit 1.
- CLI bundling preserves `node:` import prefixes (tsup's `removeNodeProtocol` default silently broke `node:sqlite` in dist while tests stayed green); a dist smoke test now runs the built artifact.

## 0.11.0 — 2026-07-27

### Breaking

- **v2 rewrite** — removed the `board-server`, `agent-server`, and `chat-relay` backend processes and the Board, Roadmap, AI Chat, Memory, Terminals, and Services desktop app pages they powered. Comparator and Observatory remain, alongside a new harness-agnostic adapter registry with golden snapshot tests. Memory is still available — as the `membrain` plugin over MCP, not a standalone desktop app section.

### Added

- **8-target compilation** — `packages/core`'s adapter registry and the `harness-share` plugin's `/harness-compile` (plus `/harness-sync`, `/harness-export`, `/harness-import`) now cover all 8 targets: Claude Code, Cursor, GitHub Copilot, Codex, OpenCode, Windsurf, Gemini CLI, and JetBrains Junie. The last five share a single `AGENTS.md` file, written once regardless of how many are active. `harness-kit detect` and the CLI's `--target` help now report all 8 (was 3).
- **Claude 5 model family** — Sonnet 5, Opus 5, Fable 5, and Haiku 4.5 across the desktop Comparator picker, Judge phase, and Observatory pricing.
- **Desktop: static marketplace catalog** — the Marketplace page now reads the real, generated 17-plugin catalog from `packages/marketplace-data`, replacing the retired Supabase-backed browser and its permanent "not configured" banner.
- **`dependabot-sweep` and `rubber-ducky` plugins** — end-to-end Dependabot remediation, and a cross-model second opinion on plans, designs, and diffs before you commit.
- **`harness.yaml` `extends`** — profiles can now extend a base harness configuration instead of duplicating it.
- **Precompiled schema validator** — the JSON Schema validator ships precompiled, dropping `unsafe-eval` from the desktop app's CSP.

### Changed

- **Desktop: Judge phase results** — labeled "Preview — simulated scores" until real model-graded judging ships.
- **install.sh** — populated the `skills` array in `plugin.json` per the Protocol schema, so remote install actually discovers skills (previously silently installed 0 of 5 for harness-share and 0 of 1 for membrain).
- **CLI binary** — standardized on `harness-kit` as the `.name()` (was `harness`, which mismatched every help example); `harness` added as a second install alias.
- **Domain normalization** — schema URLs, skill docs, and cross-references consolidated on `harnessprotocol.ai` (`.io` remains a passive alias).
- **Docs** — the `harness-docs` skill re-synced to the current 17-plugin roster (removed the deleted `board` plugin, added `rubber-ducky` and `dependabot-sweep`, corrected membrain's command to `/memory` and review's severity labels to BLOCKER/WARNING/NIT); manifest validation now checks this roster against `marketplace.json` so it can't silently drift again. Website docs purged of dead pages describing v2-removed features (Board, Roadmap, AI Chat, Memory, Terminals app pages, and the Board plugin), 16 dead marketplace links fixed, and the Claude Code integration landscape (permission modes, ACP support, tool names) corrected to match the real CLI.

### Fixed

- **Desktop: `--permission-mode auto`** — replaced with the real Claude Code permission modes (default, acceptEdits, plan, bypassPermissions); the invented plan-tier gate is gone.
- **Desktop: ACP protocol badge** — corrected (Gemini CLI ships native ACP; Claude Code's is via the Zed adapter, not native).
- **Pricing** — corrected Opus 4.6 (was priced at Opus 4.1's old rate) and Haiku 4.5 (was underpriced) alongside the Claude 5 rows.
- **Homebrew** — fixed a version-interpolation-order bug in the Formula (the URL degraded before `version` was set), and wired `release.yml` to sync the in-repo Formula/Cask into the tap (it previously only edited the tap's own drifted copy).
- **`node:crypto` bare import** — crash in production desktop builds quarantined and fixed by moving to `@noble/hashes`.
- **`harness.yaml`** — swapped the archived `@modelcontextprotocol/server-github` reference for the official `github/github-mcp-server` Docker image.

---

## 0.10.0 — 2026-06-06

Marketplace profiles-first UX with honest trust signals. Exchange layer Phase 1 (`harness exchange` keygen/offer/accept). Routine dependency updates and release pipeline fixes.

---

## 0.9.0 — 2026-06-06

Marketplace profiles-first redesign with harness profile support. Linear design system applied across the site and desktop app. Added `dependabot-sweep` and `rubber-ducky` plugins. Resolved open Dependabot security alerts.

---

## 0.8.1 — 2026-05-27

Marketplace rebuilt as a static, git-sourced browser in the docs site (Supabase retired). Unified visual identity (Iris palette + design tokens). Test suite hardened and releases gated on green CI. Security patches (fast-uri) and release pipeline fixes.

---

## 0.8.0 — 2026-05-13

Parity dashboard redesigned as a capability matrix grid. In-app update checker. ACP protocol integration for Comparator. AI chat revamp. Service health monitoring with backoff and a blank-screen fix. Nightly Homebrew build channel. Mobile-first landing page.

---

## 0.7.1 – 0.7.3 — 2026-03-17 – 2026-04-17

Large batch of desktop features: persistent board-server as a macOS launchd service, preferences page redesign, design polish (title bar, Comparator, Observatory, Permissions), Harness File page, marketplace split-panel layout, Sync page and harness editor, parity tracker with drift alerts and baselines, self-hosted team chat, membrain integration (plugin, desktop Memory section, Tauri sidecar), Comparator rebuilt twice (PTY terminal workspace, then v4 phased evaluation workbench), Kanban board redesigned twice, board execution engine, marketplace ratings/reviews and advanced search, plugin security scanner, permission mode selector, CLI Agent Discovery Grid, Observatory cost analytics and budget guards, per-card agent execution via LangGraph, distribution pipeline (Homebrew, GitHub Releases, npm, standalone binary), docs site revamp. Security fix: closed stored XSS, anonymous RPC, and rate-limiting gaps in the marketplace (v0.7.1).

---

## 0.7.0 — 2026-03-17

Tauri desktop app (Harness Manager + Marketplace browser). `@harness-kit/core` library and CLI. Harness Board (Kanban with MCP + web UI sync). Observatory usage dashboard. Comparator Phase 2 (persistence, diffs, evaluation, history). Security page (permissions, secrets vault, audit log). **Breaking:** plugins renamed for consistency (`pr-sweep`, `capture`, `lineage`, `stats`). macOS HIG polish. `ship-pr` split into `open-pr` + `merge-pr`.

---

## 0.6.0 — 2026-03-14

Added `stats` plugin (Claude Code usage dashboard). Cross-platform support for Claude Code, Cursor, and Copilot. Agents documentation and starter agent definitions. Docs visual polish and warm neutral theme.

---

## 0.5.0 — 2026-03-13

Docs visual upgrade: Inter/Space Grotesk typography, blue-tinted dark theme, homepage redesign, wider docs layout, MDX components (Tabs, Callout, Steps, Accordion), accessibility improvements.

---

## 0.4.0 — 2026-03-12

Docs site migrated from Docusaurus to Fumadocs. Custom landing page. Domain migration to harnessprotocol.io. CI updated to pnpm.

---

## 0.3.0 — 2026-03-11

Added `ship-pr` and `pull-request-sweep` plugins. `harness-share` aligned to Harness Protocol v1 (`harness-export`/`harness-import`/`harness-validate`). Skill eval framework. New comparison and harness-protocol docs pages. Org migrated from `siracusa5` to `harnessprotocol`.

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
