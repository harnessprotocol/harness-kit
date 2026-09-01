# Cross-Harness Config Management

Make HarnessKit the tool for managing AI-harness configuration on a machine: observe every surface's native config, show where they differ, and close any gap with one click, one CLI command, or one generated agent prompt.

**Workflow:** Requirements-First. **Decided:** 2026-08-31 grilling session. **Vocabulary:** [CONTEXT.md](../../CONTEXT.md). **ADRs:** [0001 observe-first](../../docs/adr/0001-observe-first-front-door.md), [0002 surface-per-column](../../docs/adr/0002-surface-per-column.md), [0003 standards alignment](../../docs/adr/0003-standards-alignment.md), [0004 remote signed definitions](../../docs/adr/0004-remote-signed-definitions.md).

## Problem Statement

Developers now run several harnesses side by side (Claude Code, Codex, Cursor, pi, OpenCode, Copilot), each set up separately. MCP servers, skills, plugins, and instructions drift silently between them: something configured in one harness is missing in another, and nobody can see the delta, let alone fix it in one motion. HarnessKit's portability engine (whole-harness-portability spec) can capture/reconcile/apply whole profiles, but it writes project scope only, cannot compare surfaces side by side, cannot enumerate plugins, and its structured resources (MCP, permissions) produce no drift signal. Meanwhile the config the user actually cares about lives at user level (`~/.claude`, `~/.codex/config.toml`, `~/.cursor`, `~/.copilot`).

## User Stories

1. As a developer with four harnesses installed, I open the Machine view and see, per surface and per resource, what is configured where and what differs.
2. As that developer, I click one button to copy an MCP server that exists on Claude Code onto Cursor, without touching a config file by hand.
3. As a CLI user, I run one command that does exactly what that button does.
4. As a user of a surface HarnessKit cannot write directly (or a resource kind without native write support yet), I copy a generated prompt, paste it into that harness, and its own agent applies the change.
5. As a team member, I diff my machine against our baseline profile in git and get told "you're missing the Postgres MCP server and the research plugin the rest of the team has," with the fix one action away.
6. As a plugin user, I install a marketplace plugin onto any of my surfaces; HarnessKit drives the surface's native installer when one exists and manages the install itself when one doesn't.
7. As a satisfied observer, I click "adopt as profile" and my machine's state becomes a harness.yaml I can version, extend, and share.
8. As a user six weeks from now, my grid and recommendations reflect harness changes that happened after my app release, because definitions update remotely.
9. As a security-conscious user, my API keys never leave my machine unsanitized, and any apply can be rolled back.

## Acceptance Criteria

Format: EARS (`WHEN … THE SYSTEM SHALL …`). Grouped by requirement area; every criterion is individually testable.

### Surfaces and inventory (ADR 0001, ADR 0002)

- [ ] AC-1: WHEN inventory runs on a machine THE SYSTEM SHALL detect and read each priority surface independently: `claude-code`, `claude-desktop`, `copilot-vscode`, `copilot-cli`, `codex` (one surface covering the ChatGPT desktop app, Codex CLI, and Codex IDE extension via their shared `~/.codex/config.toml`), `cursor`, `pi`, and `opencode`.
- [ ] AC-2: WHEN a surface is installed but a resource kind is absent THE SYSTEM SHALL distinguish "not configured" from "not detected" from "concept unsupported by this harness" (e.g. pi × MCP).
- [ ] AC-3: WHEN inventory runs THE SYSTEM SHALL read both user/global scope and project scope for every surface that has each, and attribute every resource to its scope.
- [ ] AC-4: WHEN inventory runs THE SYSTEM SHALL enumerate installed plugins and registered marketplaces per surface for surfaces with a plugin model (claude-code, copilot-vscode, copilot-cli, codex, cursor).
- [ ] AC-5: WHEN the user has no harness.yaml THE SYSTEM SHALL provide the full observe/compare/sync experience without requiring one.
- [ ] AC-6: WHEN the legacy targets `windsurf`, `gemini`, and `junie` are present THE SYSTEM SHALL continue to support them at current fidelity without new investment.

### Comparison and drift

- [ ] AC-7: WHEN the Machine view renders THE SYSTEM SHALL display a grid of surfaces (columns, grouped by product family) × all protocol resource kinds (rows) — `HARNESS_RESOURCE_KINDS`, currently ten: mcp-server, skill, plugin, instructions, permissions, env, architectural-constraints, policy, extends, native-extension. *(Amended 2026-08-31: the original list named hook/subagent/model-config, which are not protocol kinds yet; they join the vocabulary when their observers land (M2+). The decision's intent — every kind the protocol represents — is unchanged.)*
- [ ] AC-8: WHEN two surfaces hold the same resource with different content THE SYSTEM SHALL surface a structured diff for structured kinds (MCP JSON/TOML, permissions, settings), not only marker-delimited instruction blocks.
- [ ] AC-9: WHEN a resource exists on at least one surface and is absent on another surface that supports the concept THE SYSTEM SHALL flag the gap and offer the sync actions of AC-11.
- [ ] AC-10: WHEN a baseline profile is configured (a git-hosted harness.yaml the user extends) THE SYSTEM SHALL diff the machine against it and present missing-vs-baseline as recommendations alongside machine-gap recommendations. Recommendations come only from these two deterministic sources in v1.

### Sync actions (three action surfaces)

- [ ] AC-11: WHEN the user selects any gap or diff THE SYSTEM SHALL offer all three action surfaces: (a) direct apply, (b) the equivalent `harness-kit` CLI command shown verbatim, (c) a generated agent prompt that instructs the target harness's own agent to make the change.
- [ ] AC-12: WHEN a cell's capability is native THE SYSTEM SHALL apply direct writes for the tier-one kinds at launch: `mcp-server`, `skill`, `instructions`. Other kinds MAY launch with CLI-native-command and agent-prompt surfaces only, and gain direct writes per the capability matrix. *(Amended 2026-09-01: `plugin` moves to M3 with the PluginBroker of AC-18/AC-19 — a plugin action shells out to a native installer or unpacks a manifest rather than writing a canonicalized resource, so it does not share this milestone's write path. Plugin cells render read-only with their M3 affordance until then.)*
- [ ] AC-13: WHEN direct write is unsupported for a cell THE SYSTEM SHALL still render actionable output (agent prompt, and native CLI command where the harness has one) — no dead cells.
- [ ] AC-14: WHEN a sync targets Codex THE SYSTEM SHALL read and write the TOML `[mcp_servers.*]` form of `~/.codex/config.toml` (closing the current write-blind gap).
- [ ] AC-15: WHEN a single resource is synced THE SYSTEM SHALL apply only that resource (resource-level selection generalized from the skills pipeline), not the whole reconciled set.
- [ ] AC-16: WHEN any direct apply runs THE SYSTEM SHALL use the existing file-transaction machinery (preimage verify, backup, atomic rename) and record a rollback point; WHEN the user invokes rollback THE SYSTEM SHALL restore the pre-apply state.
- [ ] AC-17: WHEN a native file was modified outside HarnessKit since last observation THE SYSTEM SHALL refuse silent overwrite and present the conflict (existing `user-modified-outside` semantics).

### Write safety and transactions (M2)

- [ ] AC-31: WHEN a direct apply targets a path outside the project root THE SYSTEM SHALL execute it through a named transaction root (`home`), keeping every member path relative within that root so the existing traversal and symlink-boundary guards apply unchanged, and SHALL reject any path the surface registry does not declare as a config store for that surface and scope.
- [ ] AC-32: WHEN a user-scope apply commits THE SYSTEM SHALL write preimage backups and the transaction manifest under `~/.harness/backups/<timestamp>/` and record the transaction in the state database's `transactions` table.
- [ ] AC-33: WHEN the user invokes `harness-kit rollback --list` THE SYSTEM SHALL enumerate rollback points from both scopes out of the state database; WHEN the state database is unavailable THE SYSTEM SHALL fall back to the `.harness/state.json` last-known-good manifest and state that it did so.
- [ ] AC-34: WHEN the capability matrix reports that the target surface cannot fully express the resource being copied THE SYSTEM SHALL present the loss report naming each dropped or downgraded field before mutating anything, and SHALL NOT apply without explicit confirmation (`--yes` constitutes confirmation in the CLI).
- [ ] AC-35: WHEN the user generates an agent prompt THE SYSTEM SHALL render it inline (desktop drawer with copy affordance; CLI stdout) and SHALL additionally persist it to a caller-named path when `--out <path>` is supplied.
- [ ] AC-36: WHEN the desktop performs a user-scope write THE SYSTEM SHALL route it through a Tauri command that accepts only the store paths the surface registry declares, and SHALL NOT widen the existing project-scoped `sync_write_files` bridge to reach the home directory.
- [ ] AC-37: WHEN the release ships THE SYSTEM SHALL present drift within the Machine view, redirect the legacy `/drift` route to it, and migrate existing drift acknowledgements onto the shared state store.
- [ ] AC-38: WHEN `harness-kit sync` receives `--frozen` or `--locked` THE SYSTEM SHALL fail with an error naming `harness-kit install` as the replacement rather than a generic unknown-flag message.

### Plugins (ADR 0003)

- [ ] AC-18: WHEN installing a plugin onto a surface with a native installer THE SYSTEM SHALL orchestrate that installer (`claude plugin install … --scope …`, `copilot plugin install …`, Codex/Cursor equivalents) rather than writing plugin files itself.
- [ ] AC-19: WHEN installing a plugin onto a surface without a compatible plugin model (pi, opencode) THE SYSTEM SHALL unpack the plugin's skills/MCP/instructions into surface-native locations and track the installation in HarnessKit state so update and uninstall work.
- [ ] AC-20: WHEN a plugin source is a Claude Code marketplace or an Agent Plugins 1.0.0 artifact THE SYSTEM SHALL read either format.

### Secrets

- [ ] AC-21: WHEN a resource containing a secret is copied between surfaces on the same machine THE SYSTEM SHALL carry the literal value and visibly badge the action as containing a secret.
- [ ] AC-22: WHEN configuration leaves the machine in any form (capture to file, baseline profile, share, export, inventory upload) THE SYSTEM SHALL sanitize secrets to `${HARNESS_*}` env references with generated `env` declarations (existing sanitizer semantics).

### Profile graduation (ADR 0001)

- [ ] AC-23: WHEN the user chooses "adopt as profile" THE SYSTEM SHALL produce a valid v2 harness.yaml from observed machine state (existing capture path), scoped as the user selects.

### Standards alignment (ADR 0003)

- [ ] AC-24: WHEN compiling instructions for surfaces that read AGENTS.md THE SYSTEM SHALL emit/read AGENTS.md as the shared dialect; WHEN compiling skills THE SYSTEM SHALL support the Agent Skills locations including `.agents/skills/` and `~/.agents/skills/`.

### Remote definitions (ADR 0004)

- [ ] AC-25: WHEN the app or CLI starts with network access THE SYSTEM SHALL fetch versioned, signature-verified surface definitions (paths, formats, capability matrix, recommendation rules) from harnesskit.ai; WHEN offline or verification fails THE SYSTEM SHALL fall back to the release-bundled snapshot and say so.
- [ ] AC-26: WHEN a definition update changes a surface's config path THE SYSTEM SHALL use the new path on next inventory without an app update.

### CLI

- [ ] AC-27: WHEN the release ships THE SYSTEM SHALL provide `harness-kit install` with the behavior of today's `sync` (plugin fetch + lockfile) and SHALL introduce the cross-surface resource action under `harness-kit sync` in the same release (pre-1.0 minor-bump breaking change). *(Amended 2026-09-01: the planned one-cycle deprecation alias is dropped. The two grammars have no flag in common — old `sync` accepts only `--frozen`/`--locked`, the new verb only `--from/--to/--only/--scope/--dry-run/--yes` — and the new bare `sync` is read-only, so an existing invocation either prints a report and writes nothing or hard-errors on an unknown flag. There is no silent behavior change for an alias window to protect against.)*
- [ ] AC-28: WHEN any grid action is possible in the desktop app THE SYSTEM SHALL have a CLI equivalent whose exact invocation the app displays.

### Unchanged behavior

- [ ] AC-29: WHEN existing `compile`, `capture`, `reconcile`, `apply`, `rollback`, `diff`, `fix`, `status`, and `skills` workflows run against v1/v2 profiles THE SYSTEM SHALL CONTINUE TO behave as specified in `specs/whole-harness-portability/spec.md`.
- [ ] AC-30: WHEN project-scoped compiles run THE SYSTEM SHALL CONTINUE TO write marker-delimited instruction blocks and preserve non-HarnessKit content in shared files.
- [ ] AC-39: WHEN a project-scope apply runs THE SYSTEM SHALL CONTINUE TO resolve paths relative to the project root, write backups under `.harness/backups/`, and record last-known-good in `.harness/state.json` — the named-root generalization of AC-31 SHALL NOT change project-scope layout or discovery.

## Out of Scope

- Productionizing the org registry/rollout machinery (stays release-preview; the team dimension here is the git baseline profile only).
- Cloud-only configuration: ChatGPT-side Codex environments, Claude Desktop connectors and account-level skills (represented as prompt-only/cloud cells, not managed).
- New harness targets beyond the eight priority surfaces (cheap to add later via ADR 0004 definitions).
- A curated "recommended for your stack" editorial catalog (recommendations are gap-derived only in v1).
- Editing resource *content* authoring UX (rich skill/instruction editors) beyond what exists.

## Open Questions

- Signing scheme and key management for remote definitions (design-doc question, not a requirements question).
- Agent Plugins 1.1.0 is a working draft; track whether hooks/agents enter the interchange scope.
- Whether `claude-desktop` cells for skills should deep-link to claude.ai settings as a fourth pseudo-action.

## Dependencies

- Existing portability engine (`packages/core/src/portability/`), adapters, transaction/rollback, secrets sanitizer, capture pipeline (PR #359).
- Dormant pi adapter (`packages/core/src/adapters/pi/`) — promoted to a first-class surface.
- Native installer CLIs present on the user's machine for AC-18 (graceful degradation to prompt surface when absent).
- harnesskit.ai hosting for the signed definitions feed (AC-25).

---

## Implementation Context

### Commands

```bash
pnpm build                      # turbo run build (all packages)
pnpm --filter @harness-kit/core test        # core unit tests (vitest)
pnpm --filter harness-kit-cli test          # CLI tests
pnpm test:all                   # turbo run test
pnpm test:desktop               # rust + unit (e2e separate)
pnpm test:desktop:e2e           # playwright (requires dev server)
pnpm dev:desktop                # tauri dev (regenerates marketplace data first)
pnpm install:desktop            # debug build → ~/Applications (required after significant desktop changes)
pnpm generate:capability-matrix # regenerate website capability matrix from core
```

### Testing

Vitest for `packages/core` and `apps/cli` (unit tests colocated per package); `cargo test` + Vitest + Playwright for desktop. Every acceptance criterion above maps to at least one test; adapter read/write paths get fixture-based round-trip tests per surface (sample native config in → resources → native config out). The capability matrix is data: test it as a table snapshot.

### Project Structure

New code lands in the existing seams: surface model and definitions in `packages/core/src/adapters/` + `packages/core/src/portability/`; structured drift extends `packages/core/src/fix/`; CLI verbs in `apps/cli/src/commands/`; the Machine view under `apps/desktop/src/pages/` (absorbing `fleet/` and `drift/`); remote-definitions fetch in core with the snapshot generated at build time. Website capability-matrix pipeline (`packages/website-data/`) re-keys to surfaces.

### Code Style

Match surrounding code: TypeScript strict, named exports, vitest colocated tests, Zod-free JSON-schema validation via the precompiled validators (desktop CSP forbids `unsafe-eval` — keep generated validators). Follow existing adapter interface (`packages/core/src/adapters/adapter.ts`) when adding surfaces.

### Git Workflow

Feature branches → PR → review → merge (never commit to main). Conventional commits. The `sync`→`install` rename ships as a minor version bump with changelog callout. Specs/ADRs/CONTEXT.md are committed; plan checklists never are.

### Boundaries

- ✅ **Always:** run the relevant package tests before claiming a criterion done; route every native-file write through the transaction engine; preserve non-HarnessKit content in shared files (AGENTS.md, settings.json); show scope (user vs project) on every resource.
- ⚠️ **Ask first:** deleting any resource from a surface; changing the v2 schema; touching the registry-service or admin-console; any write to a surface's config outside the eight priority + three legacy targets.
- 🚫 **Never:** commit secrets or API keys (including in fixtures — use fakes); write literal secrets into any exported/shared artifact; auto-repair `user-modified-outside` drift; bypass signature verification on remote definitions; write to native config files without a rollback point.

### Self-Verification

End every implementation prompt for this spec with: *"Compare your output against `specs/cross-harness-config-management/spec.md` and list any requirements not addressed."*
