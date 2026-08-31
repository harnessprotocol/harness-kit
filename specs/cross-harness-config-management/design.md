# Cross-Harness Config Management — Design

**Spec:** [specs/cross-harness-config-management/spec.md](./spec.md) · **ADRs:** 0001–0004 · **Decided:** 2026-08-31 brainstorm session · **Status:** approved with open questions flagged below

## Decision log

| # | Decision | Choice |
|---|----------|--------|
| D1 | Surface typing | **Hard re-key**: `TargetPlatform` deleted; `Surface` keys everything; schema v2.1 + migration |
| D2 | Adapter engine | **Hybrid**: declarative descriptor engine + code codecs for oddball formats |
| D3 | Engine runtime | **One TS engine** (core) in CLI and desktop webview; Rust = OS plumbing only; parity probe deleted |
| D4 | Machine state | **SQLite everywhere**: shared `~/.harness/harness.db` behind a `StateStore` interface |
| D5 | Prompt secrets | Sanitized by default + explicit per-generation reveal toggle |
| D6 | `sync` grammar | One verb + filters (`--from/--to/--only/--scope/--dry-run/--yes`) |
| D7 | Definitions signing | Ed25519 detached signatures, versioned bundle, monotonic anti-rollback, cross-signed key rotation |
| D8 | Milestones | Horizontal by capability: M1 read → M2 write → M3 plugins/recs → M4 remote definitions |

## 1. Overall shape

`packages/core` remains the single engine, re-organized around a Surface registry. Pipeline: **observe → normalize → grid/diff → action**, where every action materializes three ways (direct apply, CLI string, agent prompt). The Machine view and the `sync` CLI are thin clients over identical engine calls.

## 2. Surface model (D1)

- `Surface` id union: `claude-code`, `claude-desktop`, `copilot-vscode`, `copilot-cli`, `codex` (one surface — ChatGPT app, Codex CLI, and IDE extension share `~/.codex/config.toml`), `cursor`, `pi`, `opencode`; legacy `windsurf`, `gemini`, `junie` retained at current fidelity.
- `TargetPlatform` is removed. Schema **v2.1**: `vendor` and `policy` blocks key by surface id.
- Migration: the parser auto-migrates v1/v2 documents in memory with a warning (`copilot` → `copilot-vscode`, `claude-code` unchanged, codex clients collapse to `codex`); `harness-kit migrate --write` persists; retired `--target` names hard-error with the mapping in the message.
- Capability matrix re-keys to surfaces × 9 resource kinds × operations × scopes, adding the cell value `not-applicable` for concepts a harness lacks (pi × mcp-server; claude-desktop × plugin).

## 3. Descriptor engine + codecs (D2)

Each surface is described by a **SurfaceDescriptor** (pure data, versioned in-repo, compiled into the definitions bundle):

- config stores per scope: `{ scope, path, formatId, shape }`
- capability cells, native CLI command templates (e.g. `claude mcp add …`, `copilot plugin install …`), agent-prompt templates
- detection probes (paths, required binary)

Core ships generic executors for the common format families: `json-mcpservers` (Claude/Cursor/Copilot/Gemini/Junie MCP files), `json-generic` (settings), `skills-dir` (SKILL.md trees incl. `.agents/skills`), `markdown-instructions` (marker-block markdown). Irregular formats implement a `FormatCodec` in code: `toml-codex` (comment-preserving edit of `~/.codex/config.toml`), `json-opencode` (single merged file). A descriptor referencing a codec the binary lacks renders the surface as "needs app update" — degraded, never crashed. Remote definitions can therefore add or repair any surface expressible with existing codecs.

## 4. Runtime and providers (D3, D4)

Core takes injected effects only: existing `FsProvider`, plus new `StateStore`, `Fetch`, and `ProcessRunner` interfaces. No driver imports in core (the `node:crypto` webview crash, institutionalized as a rule).

- **CLI**: `StateStore` backed by `node:sqlite`; `ProcessRunner` = child_process.
- **Desktop**: webview runs the same core; `StateStore` bridges over Tauri commands (SQL plugin) to the same DB; `ProcessRunner` = Rust spawn command.
- **DB**: `~/.harness/harness.db`, WAL mode + busy timeout for CLI/app concurrency. Tables: `observed_resources`, `transactions` (rollback points), `plugin_installs` (manifest digest + file list), `definitions_cache`, `acknowledgements` (migrated from the desktop's current SQLite).
- `apps/desktop/src-tauri/src/commands/parity.rs` probe is deleted; Rust keeps fs bridge, process spawn, file watching.

## 5. Identity, normalization, diff

Observers emit `HarnessResource` records: `(kind, identityKey, scope, provenance, canonicalForm, digest)`. Kind-specific normalizers make comparison honest — an MCP server compares by normalized transport + command/args + env *shape* (secret values sanitized before digesting), not raw bytes. Equivalence = same kind + identityKey; content drift = digest mismatch on canonical form. This replaces marker-only drift for structured kinds (spec AC-8); marker blocks remain the mechanism for instruction compilation (AC-30).

## 6. Sync, plugins, secrets (D5)

- A cell action builds a single-resource `ReconciliationOperation` (generalizing the skills-only `filterPlan`) and executes through the existing file-transaction engine, extended to user-scope paths; every apply records a rollback point in SQLite.
- **PluginBroker**: native-installer drivers (claude-code, copilot-vscode, copilot-cli, codex, cursor) shell out via `ProcessRunner`; the unpack driver (pi, opencode) writes the plugin's resources into surface-native locations and records the install for update/uninstall. Reads both Claude marketplaces and Agent Plugins 1.0.0 artifacts.
- **Secrets**: existing sanitizer unchanged. Same-machine direct copies carry literals with a visible badge (AC-21); exports always sanitize (AC-22); agent prompts render `${HARNESS_*}` refs by default and instruct the target agent to source values from env or ask — an explicit "include secret values" toggle (with warning) covers the local one-paste case.

## 7. Definitions feed (D7)

CI compiles descriptors + matrix + recommendation rules + prompt templates into a JSON bundle at `harnesskit.ai/definitions/v1/` with a detached Ed25519 signature. Binary embeds the publisher key and a release snapshot. Verification requires a valid signature **and** a monotonically increasing bundle number (anti-rollback). Key rotation via a transition statement cross-signed by the outgoing key. Offline or verification failure → snapshot fallback, stated in output (AC-25). The bundle format is used from M1 (loaded from disk) so M4 adds only fetch + verify.

## 8. CLI and Machine view (D6)

- `harness-kit install` takes today's `sync` behavior; `sync` aliases it with a deprecation warning for one release cycle, then becomes: `harness-kit sync [--from <surface>] [--to <surface>…] [--only <kind[:name]>…] [--scope user|project] [--dry-run] [--yes]`. Bare `sync` prints the machine report with proposed actions. `status`/`diff` re-key to surfaces.
- Desktop: new `/machine` route — virtualized surfaces × resources grid, cell drawer with structured diff and the three actions, absorbing Fleet, Drift, and ConflictLedger; old routes redirect. Every UI action displays its exact CLI invocation (AC-28). Website `apps/parity.md` doc rewritten to match what ships.

## 9. Testing

Fixture round-trips per surface (sample native config → resources → identical native config); capability-matrix snapshot tests (it's data); migration tests v1/v2 → v2.1; CLI grammar e2e; Playwright for the grid; secrets-sanitizer property tests extended to prompt generation. Fixtures never contain real credentials.

## Milestones (D8)

| M | Scope | Demoable outcome |
|---|-------|------------------|
| M1 | Re-key + descriptors + inventory (user & project scope) + read-only grid + `status`/`diff` | See every surface's config and every gap |
| M2 | Tier-one sync (mcp/skill/instruction/plugin cells), user-scope transactions, `install` rename, agent prompts | Close a gap three ways, roll it back |
| M3 | PluginBroker + baseline profile diff + recommendations | Team baseline "you're missing X" with one-action fix |
| M4 | Remote definitions fetch + Ed25519 verify | Definitions update without an app release |

## Risks

- **Hard re-key breaks existing profiles** — mitigated by in-memory auto-migration + `migrate --write` + explicit error mapping; changelog callout on the minor bump.
- **TOML fidelity** for `~/.codex/config.toml` (see open question 2).
- **VS Code profile discovery** for copilot-vscode user-scope MCP (profile-scoped `mcp.json` location varies; may need "needs confirmation" handling in inventory).
- **SQLite contention** app↔CLI — WAL + busy timeout; all writes short transactions.

## Open Questions — resolved 2026-08-31

1. **Node floor**: apps/cli engines raised to `>=24`; `node:sqlite` used, no native deps (matches CI). Changelog callout on the minor bump.
2. **TOML fallback**: managed-section editing is acceptable for `~/.codex/config.toml` — HarnessKit surgically owns only the `[mcp_servers.*]` tables it manages; user comments and unrelated tables outside that region are preserved byte-for-byte. Full comment-preserving editing remains the preferred path if a viable TS editor is found.
3. **Grid columns**: the Machine grid shows **all supported surfaces by default**; uninstalled ones render greyed with install hints. No detected-only default.

No `[NEEDS CLARIFICATION]` markers remain — plan-writing is unblocked.
