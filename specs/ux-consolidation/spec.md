# UX Consolidation

Turn the desktop app from three product generations sharing one sidebar into one product with five destinations, so a stranger can name what every item does and every screen leads somewhere.

**Workflow:** Requirements-First. **Source:** the 2026-09-08 UX audit (report: https://claude.ai/code/artifact/9053d366-bc71-4315-9922-c7e3124b7d5d). **Vocabulary:** [CONTEXT.md](../../CONTEXT.md). **Visual authority:** [apps/desktop/DESIGN.md](../../apps/desktop/DESIGN.md), which Phase 1 of this spec amends in §5 and §6. **Related specs:** [cross-harness-config-management](../cross-harness-config-management/spec.md) (the Machine engine; unchanged here), [team-collaboration](../team-collaboration/spec.md) (stub; AC-26 below is its first desktop step).

## Problem Statement

The audit scored the app 21/40 on Nielsen's heuristics with 7 blockers, 14 major and 8 minor findings. The visual system holds; the information architecture does not. Every screen belongs to one of three eras (a Claude-Code-only config editor, a harness.yaml compiler, and the cross-surface control plane), and each era has its own home, its own "sync" verb and its own plugin screen. Users see seven equal sidebar items, two of which are homes, one of which cannot start its own workflow (Comparator), one of which cannot install (Marketplace), and a first-run wizard that can strand them on a blank screen. The Machine grid, the one screen that expresses the product's niche, hides the copy source and cannot show where its counted gaps are.

## User Stories

1. As a first-time user, I open the app and land on one home that tells me what is on my machine and what differs, without needing a tooltip to read a cell.
2. As a developer with Claude Code, Codex and Cursor installed, I pick a gap in the grid, see which surface it copies from and to, apply it, and watch the grid update.
3. As a user who only wants to edit Claude Code's files, I find them under a group named "Claude Code" and never mistake those editors for cross-harness tools.
4. As a user who keeps a harness.yaml, I manage it on one Profile page: scan this machine to create it, compile it to a project, and share it.
5. As a team member, I point the app at our committed harness.yaml and the grid shows me what the team has that my machine lacks, with the fix one action away.
6. As a plugin user, I open a marketplace entry and install it to a surface I choose, or copy the exact command or agent prompt when the app cannot run the installer.
7. As a keyboard user, every sidebar destination and every page action is reachable from ⌘K, and the shortcuts shown in the sidebar are the shortcuts that work.
8. As a user whose first-run scan fails, I see what failed, can retry, or skip setup, and never see a blank screen.

## Acceptance Criteria

Format: EARS (`WHEN … THE SYSTEM SHALL …`). Each criterion cites the audit finding it closes (B = blocker, M = major, m = minor as numbered in the report) and the phase that ships it (P0–P4, see [design.md](./design.md) milestones). Criteria marked **[Q n]** depend on an open question below; the plan carries a default so work is not blocked.

### Navigation and information architecture

- [x] AC-1: WHEN the app opens after onboarding THE SYSTEM SHALL show exactly one home screen, Machine, at `/machine`; `/fleet` SHALL redirect to `/machine`. *(B1, P1, [Q2])*
- [x] AC-2: WHEN the sidebar renders THE SYSTEM SHALL show these top-level items in this order and no others: Machine, Profile, Claude Code, Marketplace, then Settings pinned at the bottom. Comparator appears only under AC-8. *(B1, m4, P1)*
- [x] AC-3: WHEN a sidebar group contains only screens bound to one surface THE SYSTEM SHALL name the group after that surface ("Claude Code"), and every page in the group SHALL carry the surface name in its title or subtitle. *(B2, P1, [Q5])*
- [x] AC-4: WHEN navigation is declared THE SYSTEM SHALL declare it in one module, and the sidebar, the numbered shortcuts, the command palette and the default-section setting SHALL all derive from that declaration. *(M9, m4, P1)*
- [x] AC-5: WHEN the user presses ⌘1 through ⌘4 THE SYSTEM SHALL navigate to the four sidebar items in order, ⌘, SHALL open Settings, and the shortcut badge beside each item SHALL name the key that triggers it. *(m4, P1)*
- [x] AC-6: WHEN a retired route is opened (`/fleet`, `/drift`, `/agents`, `/harness/settings`, `/security/*`) THE SYSTEM SHALL redirect to the consolidated destination and SHALL preserve any query parameter the destination reads. *(B7, M10, P0/P1)*
- [x] AC-7: WHEN Drift is requested with a harness (`/drift?harness=<id>` or `/machine?drift=1&harness=<id>`) THE SYSTEM SHALL open Machine's Drift section filtered to that harness, showing "Showing drift for <name>", and SHALL scroll the section into view. *(B7, P0)*
- [x] AC-8: WHEN the Labs setting "Comparator" is off (the default) THE SYSTEM SHALL omit Comparator from the sidebar, the shortcuts and the palette; WHEN it is on THE SYSTEM SHALL show it, and its empty state SHALL NOT tell the user to press a control that cannot start a comparison. *(B4, P1, [Q1])*
- [x] AC-9: WHEN the Observatory pages render THE SYSTEM SHALL present them under Claude Code as "Usage" with the subtitle "Claude Code usage on this machine". *(M13, P1)*
- [x] AC-10: WHEN Permissions renders THE SYSTEM SHALL present it under Claude Code at `/harness/permissions`; Secrets and Activity SHALL live under Settings; `/security/*` SHALL redirect accordingly. *(M10, P1)*
- [x] AC-11: WHEN Settings › Activity renders THE SYSTEM SHALL show the audit log and the reconciliation ledger (rollback points, portability notices, device enrollment) on the same tab. *(M10, P1)*
- [x] AC-12: WHEN Settings renders THE SYSTEM SHALL NOT offer "Visible sections" or "Observatory auto-refresh"; WHEN a stored default section points at a retired route THE SYSTEM SHALL open Machine instead. *(M12, P0/P1)*

### Machine, the home

- [ ] AC-13: WHEN the grid renders THE SYSTEM SHALL show a persistent legend naming every cell state in use (present at user scope, present in project, closable gap, differs, drift, no such concept, not managed locally, unknown) and both header badges (skipped entries, marketplaces). *(M1, P2)*
- [ ] AC-14: WHEN the inventory contains gaps or diffs THE SYSTEM SHALL mark closable-gap cells and divergent cells distinctly from plain absent and plain present cells, and selecting the Gaps or Diffs cell of the summary strip SHALL filter the grid to the matching rows. *(M2, P2)*
- [ ] AC-15: WHEN the drawer offers a copy THE SYSTEM SHALL show the source surface and the target surface as two selectable controls, defaulting the source to the effective-digest winner and the target to the first closable gap. *(M3, P2)*
- [ ] AC-16: WHEN a direct apply succeeds THE SYSTEM SHALL rescan, update the grid, and show a toast naming the resource and the target surface. *(M4, P0 for the rescan, P2 for the toast)*
- [ ] AC-17: WHEN a project directory is chosen THE SYSTEM SHALL offer one selector in the title bar, and Machine, the Drift section and Profile › Compile SHALL read the same value. *(M5, P2)*
- [ ] AC-18: WHEN Drift is shown THE SYSTEM SHALL present it as a view of Machine reached from a "Drift vs harness.yaml" strip cell and a view toggle, not a collapsed accordion, and acknowledge and fix SHALL continue to work as specified by cross-harness-config-management AC-37. *(P2)*
- [ ] AC-19: WHEN the drawer is open THE SYSTEM SHALL keep every grid column reachable (the content insets or the grid scrolls beside the drawer); the drawer SHALL NOT cover columns. *(m5, P2)*
- [ ] AC-20: WHEN a scan or load fails THE SYSTEM SHALL say what failed and offer one action, with the raw error behind a "Details" disclosure; no page SHALL render a bare `String(err)`. *(m2, P2)*
- [ ] AC-21: WHEN a page has actions THE SYSTEM SHALL register them in the command registry so ⌘K lists them while that page is open, and the title bar SHALL show a ⌘K affordance. *(M9, P2)*

### Profile (harness.yaml)

- [ ] AC-22: WHEN Profile opens and no harness.yaml exists THE SYSTEM SHALL offer "Scan this machine" as the primary action, run the machine import, and show the synthesized YAML for review before writing. *(M7, P3; closes cross-harness AC-23 for the desktop)*
- [ ] AC-23: WHEN a harness.yaml exists THE SYSTEM SHALL show the YAML editor and a structured panel side by side, and an edit in the panel SHALL update the YAML and vice versa. *(M7, P3)*
- [ ] AC-24: WHEN the user compiles THE SYSTEM SHALL present today's Sync flow as "Compile to project" inside Profile, with the preview rendered beside the form rather than below it. *(m6, P1 for the move, P3 for the layout)*
- [ ] AC-25: WHEN the user chooses Share THE SYSTEM SHALL produce a secret-sanitized harness.yaml export and an agent prompt that recreates the profile on another machine, using the existing sanitizer semantics. *(P3)*
- [ ] AC-26: WHEN a team baseline path is configured THE SYSTEM SHALL render "Team baseline" as a column of the Machine grid, marking each declared resource "required" and each absent one "missing here", and SHALL offer the drawer's copy action to close each missing cell. *(P3, [Q4]; reuses cross-harness AC-10)*

### Marketplace, plugins and MCP

- [ ] AC-27: WHEN a marketplace plugin detail renders THE SYSTEM SHALL offer "Install to …" with a surface picker that yields the same three action surfaces as the Machine drawer (direct apply where a driver exists, the CLI command, the agent prompt) and a copy control on the install command. *(B5, P3)*
- [x] AC-28: WHEN the marketplace catalog renders THE SYSTEM SHALL state when the catalog was generated and SHALL NOT describe a bundled snapshot as a live registry. *(B5, P1)*
- [ ] AC-29: WHEN a folder is dragged over the Plugins page THE SYSTEM SHALL either import it through the Tauri drag-drop event or show no drop overlay at all. *(M14, P2)*
- [ ] AC-30: WHEN the MCP servers page renders THE SYSTEM SHALL read the store paths from the surface registry, SHALL show the teaching empty state when no store exists, and SHALL offer adding and editing a server through a form rather than only raw JSON. *(B3, P2)*

### Editors

- [x] AC-31: WHEN a save is triggered by any control (toolbar Save, the editor's Cmd+S, the window's Cmd+S) THE SYSTEM SHALL route it through the confirmation path for critical files exactly once. *(M8, P0)*

### Onboarding

- [x] AC-32: WHEN the first-run scan fails THE SYSTEM SHALL show the error and a Retry action on the reveal step; the wizard SHALL never render an empty step. *(B6, P0)*
- [x] AC-33: WHEN onboarding shows any step THE SYSTEM SHALL offer "Skip setup", which marks the welcome as seen and lands on Machine. *(B6, P0)*

### Copy, icons and the design system

- [x] AC-34: WHEN a control is labelled THE SYSTEM SHALL name what happens; no control SHALL be labelled "Recompile" unless it compiles, and no timestamp SHALL be shown for an action that did not occur. *(M6, P1)*
- [x] AC-35: WHEN user-facing copy renders THE SYSTEM SHALL contain no exclamation marks, no emoji or text glyphs used as icons, and SHALL use CONTEXT.md vocabulary: "surface" (never "platform" or "target"), "harness" (never "agent" for a harness), one product name. *(m1, m3, P0/P1)*
- [ ] AC-36: WHEN a themed property is set in page code THE SYSTEM SHALL use a token variable, and a lint SHALL fail the build on hex, rgb or hsl literals under `apps/desktop/src/pages` and `apps/desktop/src/components`. *(design-system debt, P4)*
- [ ] AC-37: WHEN a modal, toast or tooltip is needed THE SYSTEM SHALL use `@harness-kit/ui` Modal, an app-level toast viewport and a `@harness-kit/ui` Tooltip; the seven desktop-local modal implementations SHALL be gone. *(design-system debt, P4)*
- [x] AC-38: WHEN the app launches THE SYSTEM SHALL load no webfont. *(design-system debt, P0)*
- [ ] AC-39: WHEN CI runs the desktop job THE SYSTEM SHALL screenshot the fixture routes in dark and light at 1440 and 1024 and fail on any console error. *(DESIGN.md §8, P4)*
- [ ] AC-40: WHEN the app runs on macOS THE SYSTEM SHALL provide a menu bar whose View and Help menus list every keyboard shortcut and the Docs link. *(m8, P4, [Q6])*
- [x] AC-41: WHEN the release ships THE SYSTEM SHALL contain none of: the Agents page, Harness Resilience Profiles, FirstRunPermissionModal, ConfirmDialog, HarnessEditorModal, PluginExplorerModal, FileViewerPage, the `/harness/settings` page, `apps/desktop/src/components/ui/*`, the Board-era tokens, `--card-glass`, `--cat-purple`. *(M11, P0/P1)*
- [x] AC-42: WHEN the Comparator results phase renders THE SYSTEM SHALL NOT show a rating derived from an exit code, and no copy SHALL promise "record results manually" unless a results form exists. *(B4, P1)*

### Unchanged behavior

- [x] AC-43: WHEN Drift acknowledge or fix runs THE SYSTEM SHALL CONTINUE TO use the shared `harness.db` acknowledgements and the dry-run preview modal. *(cross-harness AC-37)*
- [x] AC-44: WHEN a direct apply runs from the drawer THE SYSTEM SHALL CONTINUE TO route through the transaction engine with preimage verification and a rollback point. *(cross-harness AC-16, AC-31, AC-36)*
- [x] AC-45: WHEN existing routes `/machine`, `/harness/*`, `/marketplace/*`, `/observatory*`, `/preferences/*` and `/comparator` are opened THE SYSTEM SHALL CONTINUE TO resolve them; this spec regroups and relabels, it does not rename paths.
- [x] AC-46: WHEN the CLI runs THE SYSTEM SHALL CONTINUE TO behave as specified; this spec adds no CLI verbs and changes none.
- [x] AC-47: WHEN the `__fixtures__/machine`, `__fixtures__/drift` and `__fixtures__/onboarding` routes render in DEV THE SYSTEM SHALL CONTINUE TO render their presentational views with static data.

### Traceability

| Audit finding | Criteria | Phase |
|---|---|---|
| B1 two homes | AC-1, AC-2 | P1 |
| B2 Configure is Claude Code only | AC-3 | P1 |
| B3 three sync verbs, two MCP files | AC-30, AC-24 | P1–P2 |
| B4 Comparator closed loop | AC-8, AC-42 | P1 |
| B5 Marketplace cannot install | AC-27, AC-28 | P1, P3 |
| B6 onboarding blank overlay | AC-32, AC-33 | P0 |
| B7 Fleet click loses filter | AC-6, AC-7 | P0 |
| M1 no legend | AC-13 | P2 |
| M2 gaps not locatable | AC-14 | P2 |
| M3 no copy source | AC-15 | P2 |
| M4 apply does not refresh | AC-16 | P0, P2 |
| M5 two project directories | AC-17 | P2 |
| M6 Recompile all | AC-34 | P1 |
| M7 harness.yaml contract | AC-22, AC-23 | P3 |
| M8 save confirmation bypass | AC-31 | P0 |
| M9 hardcoded palette | AC-4, AC-21 | P1, P2 |
| M10 Security entry points | AC-10, AC-11 | P1 |
| M11 dead code | AC-41 | P0, P1 |
| M12 Visible sections, auto-refresh | AC-12 | P0, P1 |
| M13 Observatory scope | AC-9 | P1 |
| M14 drag-to-import | AC-29 | P2 |
| m1–m3 vocabulary, raw errors, glyphs | AC-20, AC-35 | P0–P2 |
| m4 nav vs DESIGN.md §5 | AC-2, AC-5 | P1 |
| m5 drawer covers grid | AC-19 | P2 |
| m6 layout defects | AC-24 | P3 |
| m7 header pattern | design D13 | P4 |
| m8 native feel | AC-40 | P4 |
| Design-system sweep | AC-36–AC-39, AC-41 | P0, P4 |

## Out of Scope

- New CLI verbs, engine changes in `packages/core`, or new surfaces. Where a criterion needs a core helper (AC-25's profile prompt, AC-26's baseline column), the plan names the seam and stops for approval.
- A hosted team backend, accounts, or the org registry beyond the enrollment tab that already exists.
- Restoring in-app Comparator execution.
- Redesigning the visual identity. Direction A stays; this spec only enforces it.
- Website and documentation changes beyond updating DESIGN.md.

## Open Questions

Defaults are what the plan assumes until answered. Criteria tagged with the question stay implementable under the default.

- [NEEDS CLARIFICATION: Q1. Comparator: keep it behind Settings › Labs (default) or delete it together with Agents and the resilience profiles? Default: Labs, because the results and voting UI is real.]
- [NEEDS CLARIFICATION: Q2. Fleet: retire it into Machine (default) or keep it under Profile as a compliance view? Default: retire; its unit (adapter) predates ADR 0002 and both of its click flows are broken.]
- [NEEDS CLARIFICATION: Q3. Keep the name "Machine" for the home (default) or rename it ("This computer", "Overview")? Default: keep, with the subtitle doing the explaining.]
- [NEEDS CLARIFICATION: Q4. Team baseline: git-only, a committed harness.yaml read from a local path first (default), with URL fetch waiting on the signed-definitions transport? Default: yes.]
- [NEEDS CLARIFICATION: Q5. Should Codex and Cursor get file editors like Claude Code, or is the Machine drawer the only write path to them? Default: drawer only; the group is named "Claude Code" and future surfaces become sibling groups.]
- [NEEDS CLARIFICATION: Q6. Native menu bar in Phase 4 (default) or earlier?]

## Dependencies

- `packages/core` machine inventory, gaps, diffs, cell actions and the file-transaction engine (cross-harness M1–M3, shipped).
- `packages/ui` components (Modal, Toast, StatusChip, SummaryStrip, EmptyState, Sidebar) and `packages/design-tokens`.
- `harness-kit status --baseline` (cross-harness AC-10) for AC-26.
- The e2e Tauri bridge mock and the DEV fixture routes for AC-39.

## Implementation Context

### Commands

```bash
pnpm install --frozen-lockfile                          # once per worktree
pnpm turbo run build --filter='harness-kit-desktop^...' # build desktop's package deps (tokens, shared, core, ui)
pnpm run generate:marketplace:desktop                   # marketplace.generated.json (required before vite)
pnpm --filter harness-kit-desktop exec tsc --noEmit     # desktop typecheck
pnpm --filter harness-kit-desktop test                  # vitest (unit, jsdom)
pnpm --filter harness-kit-desktop test -- src/layouts   # one directory
pnpm --filter harness-kit-desktop tauri dev             # run the real app (Vite :1422 + Rust); only reliable way on macOS 26
pnpm --filter harness-kit-desktop test:e2e              # playwright over the Tauri bridge mock (needs Vite on :1422)
pnpm --filter harness-kit-desktop check:capabilities    # Tauri capability coverage
pnpm generate:tokens                                    # after editing packages/design-tokens/src/tokens.ts
pnpm install:desktop                                    # debug .app to ~/Applications for final validation
```

### Testing

Vitest with jsdom, colocated under `__tests__` next to the page or lib; Playwright specs under `apps/desktop/e2e/tests` using `appPage` from `e2e/fixtures.ts` (injects `tauri-bridge-mock.ts`; add a `MOCK_RESPONSES` entry for every new Tauri command a test exercises). Every acceptance criterion above maps to at least one unit test, and the navigation criteria (AC-1–AC-12) also to a smoke test. Screenshot verification uses the DEV-only `/__fixtures__/*` routes. Known environment gotcha: Node 24's built-in `localStorage` can shadow jsdom's in vitest; if a test that touches `localStorage` fails only locally, see the repo memory note `node24-localstorage-shadowing` before blaming the branch.

### Project Structure

```
apps/desktop/src/
├── nav.ts                       ← NEW in Phase 1: single navigation declaration (AC-4)
├── lib/commands.ts              ← NEW in Phase 2: command registry (AC-21)
├── lib/project-dir.ts           ← the one project-directory store (AC-17)
├── lib/preferences.ts           ← settings; labs flags live here
├── layouts/AppLayout.tsx        ← sidebar + title bar; consumes nav.ts
├── components/                  ← app-specific components; no page palettes
├── pages/machine/               ← Machine home: grid, legend, drawer, drift view
├── pages/drift/                 ← Drift section (rendered inside Machine)
├── pages/harness/               ← Claude Code editors + Profile (harness.yaml, sync); paths unchanged
├── pages/marketplace/
├── pages/observatory/           ← "Usage" under Claude Code; paths unchanged
├── pages/security/              ← Permissions (Claude Code), Secrets, Audit (Settings)
├── pages/comparator/            ← Labs-gated
├── pages/__fixtures__/          ← DEV screenshot fixtures
└── e2e/                         ← smoke, prod-smoke, console-hunt, screenshots
packages/ui/src/components/      ← Modal, Toast, Tooltip, PageHeader, StatusChip …
```

### Code Style

TypeScript strict, named exports, React function components, no `any`. Themed properties come from tokens through `@harness-kit/ui`:

```tsx
// yes
import { Button, StatusChip } from "@harness-kit/ui";
import { ChevronRight } from "lucide-react";
<Button variant="ghost" size="sm" onClick={rescan}>Rescan</Button>
<StatusChip variant="warning">Drift 3</StatusChip>
<ChevronRight size={12} strokeWidth={1.7} aria-hidden="true" />

// no
<span style={{ color: "#d97706" }}>⚠ Budget exceeded!</span>
<button className="btn" style={{ border: "1px solid rgba(255,255,255,.1)" }}>Recompile all</button>
```

Icons: `lucide-react` only, default `size={16}`, `strokeWidth={1.7}`. Copy: sentence case, no exclamation marks, buttons say what happens, errors say what broke and what to do. Tests: `describe` per behaviour, `it` sentences that read as the criterion.

### Git Workflow

One branch per phase off `main` (`ux/p0-stop-the-bleeding`, `ux/p1-consolidate-nav`, …), one PR per phase, conventional commits (`feat(desktop):`, `refactor(desktop):`, `chore(desktop):`, `docs:`), review, then `/merge-pr`. DESIGN.md §5–§6 change in the same PR as the navigation change. `specs/` is committed; `docs/plans/` never is. Never commit to `main`.

### Boundaries

- ✅ **Always:** run `pnpm --filter harness-kit-desktop exec tsc --noEmit` and `pnpm --filter harness-kit-desktop test` before claiming a criterion done; keep every path in AC-45 resolving; keep acknowledge/fix and the transaction engine untouched; screenshot the fixture routes dark and light before requesting review on a visual change.
- ⚠️ **Ask first:** any change under `packages/core` or `src-tauri` (new Tauri commands, capabilities, ACL); deleting user data stores (the Comparator database, drift acknowledgements); changing a `localStorage` preference key that would drop a user's stored value; removing a route that is not listed in AC-6.
- 🚫 **Never:** commit secrets or API keys (fixtures use fakes); write native config outside the transaction engine; auto-repair `user-modified-outside` drift; add a webfont to the app; put a hex, rgb or hsl literal in page code; ship an emoji as an icon; commit anything under `docs/plans/`.

### Self-Verification

End every implementation prompt for this spec with: *"Compare your output against `specs/ux-consolidation/spec.md` and list any requirements not addressed."*
