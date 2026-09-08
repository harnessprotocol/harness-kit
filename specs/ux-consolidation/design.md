# UX Consolidation — Design

**Spec:** [specs/ux-consolidation/spec.md](./spec.md) · **Audit:** 2026-09-08 report · **Status:** proposed 2026-09-08, awaiting answers to Q1–Q6 in the spec; every decision below carries the default the plan assumes.

## Decision log

| # | Decision | Choice |
|---|----------|--------|
| D1 | Home | **Machine only.** Fleet retires; `/fleet` redirects. Its Drifted count returns as a Machine strip cell once Drift is a view (D6). Coverage and Last compiled are dropped: the first was a derived ratio nobody acts on, the second was fabricated. *(Q2 default)* |
| D2 | Navigation source | **One module, `apps/desktop/src/nav.ts`.** Exports the ordered `NAV` entries (id, label, path, Lucide icon, shortcut number, children, optional `labs` key) and `SETTINGS`. Sidebar, `useGlobalShortcuts`, `CommandPalette` and the default-section setting derive from it. `NAV_SECTIONS`, `DEMOTED_SECTIONS` and `NAV_PATHS` are deleted. |
| D3 | Routes | **Paths do not change; grouping and labels do.** A Tauri app has no address bar, so renaming paths buys nothing and churns every test. Retired pages get `<Navigate>` redirects that carry the query string. |
| D4 | Labs gate | A `labs` field on a nav entry plus a boolean preference (`harness-kit-labs-<key>`). Off by default hides the entry from sidebar, shortcuts and palette; the route stays mounted so a direct navigation still renders. Comparator is the first labs entry. *(Q1 default)* |
| D5 | Group naming | **Honest scoping.** The v1 editors become the "Claude Code" group. When another surface gains file editors it becomes a sibling group; no generic "Configure" group returns. *(Q5 default)* |
| D6 | Drift | **A view of Machine, not a page.** `view=drift` in the Machine query selects it; the strip gains a "Drift vs harness.yaml" cell whose count comes from the drift scan and whose click sets the view. `harness=<id>` keeps filtering. `DriftPage` stays the data owner; `DriftView` renders embedded. The accordion goes away. |
| D7 | Cell states | **One variant table drives cells and legend.** `pages/machine/cell-state.ts` maps `{cell, gaps, diffs, drift}` to a variant (`present-user`, `present-project`, `gap`, `differs`, `drift`, `none`, `unmanaged`, `unknown`) with label, glyph and tone. `MachineGrid` renders the variant; `GridLegend` iterates the same table. Adding a state adds one row. |
| D8 | Drawer | **From → to.** Source select (present surfaces, default effective-digest winner), target select (gap targets first, then diff targets). Layout: the page content gets `paddingRight` equal to the drawer width while open, so no column hides under it; the drawer also gets a resizable edge later if needed. |
| D9 | Project directory | **`lib/project-dir.ts` is the only store.** The title bar hosts the selector (current label, Browse, Clear). It writes the existing `harness-kit-sync-recent-dirs` key and dispatches `harness-kit-project-changed`; Machine, Drift and Sync subscribe. Machine's page-level input is removed. |
| D10 | Command registry | `lib/commands.ts`: `registerCommands(scope, commands)` returns an unregister function; `useCommands()` returns the live list. `CommandPalette` merges navigation commands from `nav.ts` with registered page actions. Pages register in an effect keyed by route. The title bar shows a ⌘K button that opens the palette. |
| D11 | Profile page | `/harness/file` keeps its path and becomes "Profile". Empty state: "Scan this machine" runs the onboarding import (`importMachine`) and shows the preview before writing. Populated state: split Monaco + structured panel (existing `harness-file/*Section` components made editable, writing back through the YAML document). Sync moves under Profile as "Compile to project" with the preview beside the form. Share (AC-25) renders the sanitized YAML and a profile-level agent prompt; the prompt builder is a **core seam that needs approval** (see Risks). |
| D12 | Team baseline | A preference `harness-kit-baseline-path` (local path only, Q4). Machine calls the same core recommendation entry `harness-kit status --baseline` uses, and renders a pseudo-surface column "Team baseline" after the real surfaces: `required` where the baseline declares the resource, `missing here` where the machine lacks it everywhere. The drawer's target list includes "from baseline" copies only where a real surface can receive them; otherwise it offers CLI and agent prompt. |
| D13 | Page header | `PageHeader` in `packages/ui` (title, subtitle, actions, optional eyebrow). Every page uses it, including the editor pages, which put the file path in the subtitle and keep `EditorToolbar` below. Kills the file-toolbar-only header. |
| D14 | Errors | `ScanError` pattern: one sentence naming what failed, one action, raw error under a "Details" disclosure. Implemented as `packages/ui` `ErrorNotice` with `title`, `action`, `details`. |
| D15 | Modal, toast, tooltip | All modals on `@harness-kit/ui` `Modal`. A `ToastProvider` in `AppLayout` with `useToast()`; Drift's local toast state migrates to it. `Tooltip` moves from `apps/desktop/src/components` into `packages/ui`. |
| D16 | Screenshot gate | `e2e/tests/screenshots.spec.ts` renders each `__fixtures__/*` route in dark and light at 1440×900 and 1024×700, asserts zero console errors, and uploads PNGs as a CI artifact from the existing `desktop-build-test` job. |
| D17 | Menu bar | Built from the JS side with `@tauri-apps/api/menu` so `nav.ts` drives it: View lists the numbered entries with their accelerators, Help lists Docs. *(Q6 default; needs the `menu` capability, an ask-first change under `src-tauri`)* |

## 1. Navigation model

```
nav.ts
  NAV: NavEntry[]           ordered; shortcut 1..n on top-level entries
  SETTINGS: NavEntry        pinned bottom, ⌘,
  visibleNav(labs)          filters labs entries by preference
  shortcutPaths(entries)    ordered paths for ⌘1..⌘n
```

Consumers read `visibleNav(getLabs())` and re-render on `harness-kit-prefs-changed`. `isSectionActive` keeps its query-marker logic so `/machine?view=drift` lights the Machine item only (Drift has no item of its own after D6; a Drift command remains in the palette).

Sidebar layout after D1–D5:

```
Machine                ⌘1
Profile                ⌘2   › harness.yaml · Compile to project
Claude Code            ⌘3   › Instructions · MCP servers · Plugins · Hooks · Permissions · Usage · All files…
Marketplace            ⌘4
Comparator             (labs)
─
Docs (until D17)
Settings               ⌘,   General · Secrets · Activity · Labs
```

## 2. Machine view model

`machine-view-model.ts` grows a `viewOf(searchParams)` (`"grid" | "drift"`) and `filterOf(searchParams)` (`"all" | "gaps" | "diffs"`). The strip cells become buttons that set the filter or the view; the active one carries an azure underline. `cell-state.ts` (D7) is pure and unit-tested against the fixture inventory. Drift's count is loaded lazily (its scan asks for project scope) and the cell shows "…" until it arrives; opening the view mounts `DriftPage` as today.

## 3. Drawer action model

`RowActions` takes `source` and `target` as state, both selectable. `buildCellAction(row, source, target)` is unchanged. Defaults: source = the entry whose digest equals `cell.effectiveDigest`, else the first present surface; target = `missingTargets(...)[0]`, else `divergentTargets(...)[0]`. Apply calls `onApplied` (now wired), which rescans and toasts `Copied <name> to <surface>`.

## 4. Profile and sharing

Share output has two halves. The YAML half already exists (capture + sanitizer). The prompt half does not: core has per-cell agent prompts but no profile-level one. Design: `buildProfilePrompt(profile, options)` in `packages/core/src/portability/` returning a Markdown prompt that lists resources by kind with install instructions per surface. This is the one core addition in the spec and is gated on approval; until it lands, Share offers the YAML export only.

## 5. Testing

Unit tests per task (see plan). Behavioural anchors: `nav.ts` alignment test replaces the two "lengths must match" tests; `cell-state.ts` table test; `DriftRedirect` query test; drawer default-selection test; `PreferencesPage` labs toggle test; onboarding error and skip tests. Smoke tests gain redirects and lose Fleet. The screenshot gate (D16) is the visual regression net for Phases 2–4.

## Milestones

| Phase | Ships | Gate |
|---|---|---|
| P0 Stop the bleeding | AC-6/7 (redirect + filter), AC-16 rescan, AC-31, AC-32, AC-33, AC-38, AC-41 part, AC-35 part, AC-12 part | none |
| P1 Consolidate the sidebar | AC-1–AC-5, AC-8–AC-12, AC-28, AC-34, AC-41, AC-42, DESIGN.md §5 | Q1, Q2, Q5 (defaults) |
| P2 Machine as the instrument | AC-13–AC-21, AC-29, AC-30 | none |
| P3 Profile, sharing, teams | AC-22–AC-27 | Q4; core seam approval for AC-25 |
| P4 System hygiene and native feel | AC-36, AC-37, AC-39, AC-40, D13 | Q6 |

## Risks

- **Fleet's users.** Retiring Fleet removes the adapter-by-scope matrix. Mitigation: the Machine grid carries scope per entry (`u`/`p` today, chips after D7) and Drift keeps per-harness grouping.
- **Labs hides data.** Comparator sessions persist in its database; turning Labs on restores them. No deletion.
- **Core seam for Share.** AC-25's prompt builder touches `packages/core`; the spec's ask-first boundary applies. Phase 3 stops at that task until approved.
- **Menu capability.** D17 needs a Tauri capability change; ask first.
- **Test churn.** Deleting `NAV_SECTIONS`/`NAV_PATHS` touches `AppLayout.test.tsx`, `useGlobalShortcuts.test.ts`, `PreferencesPage.test.tsx`, `preferences.test.ts`, and the three e2e specs. The plan lists every edit.

## Open Questions

Carried in the spec as Q1–Q6 with defaults; none blocks Phase 0.
