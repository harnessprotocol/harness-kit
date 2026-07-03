# Harness Kit v2 — Design Spec (canonical)

**Status:** Signed off 2026-07-03. Direction **A "Instrument"** selected.
**This file is the source of truth for all v2 UI work.** Agents build against this, never invent. When this conflicts with older styling on `main`, this wins. Token values here are expressed against the **existing CSS variable names** in `packages/design-tokens/src/tokens.ts` so rollout is a values-swap + `pnpm generate:tokens` — do not rename variables.

Product framing (why the UI looks the way it does): Harness Kit v2 is **the control plane for your AI coding harnesses** — a dense professional instrument that is scanned and operated, not read top-to-bottom. It is dogfooded daily and must also win a stranger's first five minutes. It is NOT a marketing site; marketing scale lives only on the website.

---

## 0. Direction A "Instrument" — the one-line brief

Warm graphite base + a single azure accent. Linear/Warp lineage but **warm-tinted, not cool slate** — the warm neutral is the whole differentiator; drifting to blue-grey slate makes it generic. Data is mono, dense, and calm. Azure appears only on the active nav rail, primary actions, links, focus, and accented numerals. Everything else is quiet.

---

## 1. Anti-slop rules (hard rejects in review)

Reject any UI that contains:
- Cool blue-grey **slate** neutrals (this direction is warm graphite — `#131215`, not `#0f172a`). Purple/indigo/violet accents. Purple→blue gradients.
- Glassmorphism, gradient hero text, glow-on-everything, floating 3D blobs.
- **Emoji as icons.** Icons are Lucide only, `viewBox="0 0 24 24"`, stroke 1.7, `w:16` default (20 for headers). One set, consistent stroke.
- Visible 1px neutral borders as the default separator. **Borderless is a core principle** — separate with background elevation steps + spacing + soft shadow. `--border-*` alphas are deliberately near-invisible; use them only as hairline reinforcement, never as the primary divider.
- Marketing aesthetics inside the app: oversized type, 48px section gaps, centered hero layouts.
- Four-stat-cards-in-a-row as decoration. Show data the user acts on, or nothing.
- **Inline hex or spacing literals in page code.** Every themed property comes from a token var through a `packages/ui` component. (Lint-enforced in `apps/desktop/src/pages`.)
- Exclamation marks in app copy. Vague errors. System-jargon labels.

---

## 2. Color tokens (map onto existing var names)

Status colors are **shared across themes** and are NOT the accent. Only azure is the accent.

### Dark (default)
```
--bg-base:        #131215   /* warm graphite — NOT slate */
--bg-surface:     #1B191E   /* panels, cards, table body */
--bg-elevated:    #242128   /* header rows, chips, hover targets */
--bg-sidebar:     rgba(27,25,30,0.85)
--fg-base:        #EDEAE6   /* warm off-white */
--fg-muted:       #A29C95
--fg-subtle:      #6C665F
--fg-placeholder: #514C46
--border-base:    rgba(255,255,255,0.05)
--border-strong:  rgba(255,255,255,0.09)
--border-subtle:  rgba(255,255,255,0.03)
--accent:         #2E9BE6   /* azure — active nav, primary btn, links, focus */
--accent-light:   rgba(46,155,230,0.14)   /* accent tint bg (active nav, hover rows) */
--accent-text:    #6BC0F5   /* azure text on dark, AA on --bg-base */
--accent-glow:    rgba(46,155,230,0.35)   /* focus ring / soft accent shadow */
--hover-bg:       rgba(255,255,255,0.04)
--active-bg:      rgba(255,255,255,0.07)
```

### Light
```
--bg-base:        #F4F2EF   /* warm paper-neutral — NOT pure #fff, NOT cool grey */
--bg-surface:     #FFFFFF
--bg-elevated:    #ECEAE5
--bg-sidebar:     rgba(244,242,239,0.85)
--fg-base:        #1A1714
--fg-muted:       #57514A
--fg-subtle:      #8B8479
--fg-placeholder: #A8A199
--border-base:    rgba(20,15,10,0.06)
--border-strong:  rgba(20,15,10,0.10)
--border-subtle:  rgba(20,15,10,0.03)
--accent:         #2E9BE6   /* icons / large accents / fills */
--accent-light:   rgba(46,155,230,0.10)
--accent-text:    #1668A6   /* azure TEXT on light must use this (AA on white); #2E9BE6 fails small-text contrast */
--accent-glow:    rgba(46,155,230,0.25)
--hover-bg:       rgba(20,15,10,0.04)
--active-bg:      rgba(20,15,10,0.07)
```

### Status (shared, both themes)
```
--success:  #3FB07A   --success-light: rgba(63,176,122,0.14)
--warning:  #E0A33D   --warning-light: rgba(224,163,61,0.16)
--danger:   #F2555A   --danger-light:  rgba(242,85,90,0.14)
```
Drift counts use `--warning`; conflicts/denials use `--danger`; in-sync uses `--success`. Status chips = tinted bg + colored text + a 6px dot. **Never solid-fill pills.**

### Shadows (warm-tinted in light)
```
Dark:  --shadow-sm: 0 1px 2px rgba(0,0,0,.4)
       --shadow-md: 0 6px 20px -6px rgba(0,0,0,.55)
       --shadow-lg: 0 16px 40px -12px rgba(0,0,0,.6)
Light: --shadow-sm: 0 1px 2px rgba(20,15,10,.08)
       --shadow-md: 0 8px 24px -8px rgba(20,15,10,.14)
       --shadow-lg: 0 18px 48px -16px rgba(20,15,10,.18)
```

---

## 3. Typography

- **UI face:** system stack `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`. No webfonts in the app.
- **Data/mono face:** `ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace`. Use for: file paths, YAML, versions, counts in tables, diffs, MCP commands, harness IDs. `font-variant-numeric: tabular-nums` anywhere digits align in columns.
- A distinctive display face is allowed on the **website only**, never in the app.

Scale (px / weight):
| Role | Size | Weight | Notes |
|---|---|---|---|
| Page title | 19 / 650 | | `letter-spacing:-.01em` |
| Section headline | 13 / 600 | | |
| Body / table cell | 12.5–13 / 450 | | line-height 1.5 |
| Caption | 11 / 450 | `--fg-muted` | |
| Micro-label (uppercase) | 10.5 / 650 | `--fg-subtle`, `letter-spacing:.07em`, `text-transform:uppercase` | column headers, group labels |
| Big metric | 23 / 660 | tabular-nums, `-.02em` | summary strip, onboarding stats |
| Mono data | 10.5–12 | | versions/paths/values |

Headings get `text-wrap: balance`. Running prose (rare in-app) stays ≤ ~65ch.

---

## 4. Layout, spacing, motion, interaction

- **Density:** compact. Table/list row height **46px** (this direction is data-dense but not cramped — do not go below 40). 8px spacing grid: 4 / 8 / 12 / 16 / 24. Main content padding 24–28px.
- **Sidebar:** 216px (240 acceptable), collapsible, `--bg-sidebar` with `inset -1px 0 0 --border-base` (no hard border).
- **Elevation model:** `--bg-base` (app) → `--bg-surface` (panels/cards) → `--bg-elevated` (header rows, chips, hover). Depth comes from these + `--shadow-*`, not outlines.
- **Radius:** 8px controls/cards, 7px chips, 6px small icon tiles, 11–12px large panels.
- **Motion:** 150–250ms ease-out, `transform`/`opacity` only. No spring/bounce. Respect `prefers-reduced-motion` (kill transitions/animations).
- **Interaction:** `cursor:pointer` on everything clickable. Hover = background tint (`--hover-bg` or `--accent-light` on rows), **never a scale transform that shifts layout**. Visible focus ring: `2px solid --accent` (or `--accent-glow` box-shadow), offset 2px. Cmd+K command palette with a **central command registry** (adding a page auto-registers its command — no hardcoded palette list).
- **Empty states teach:** every empty surface states what it's for + why it's empty + one action button. Never a blank pane.
- **Copy voice:** plain, specific, count-forward ("5 harnesses, 5 drifted", "Drift 3"). Buttons say what happens ("Recompile all" → toast "Recompiled 4 configs"). Errors: what broke + how to fix. No exclamation marks.

---

## 5. Information architecture

Sidebar, top→bottom, grouped:
```
[logo] Harness Kit
WORKSPACE
  Fleet          (home)
  Configure
  Drift          (badge = drift count, --danger-light chip)
  Comparator
  Observatory
  Marketplace
  ─────
  Settings       (pinned bottom)
```
No Labs. No Services. No Board/Roadmap/Chat/Memory/Terminals. Nothing else.

Active nav item: `--accent-light` background + a 2.5px inset azure rail on the left (`--accent`), `font-weight:550`. Inactive: `--fg-muted`, hover → `--bg-elevated` + `--fg-base`.

---

## 6. Screen contracts

Reference implementation of the visual language: the signed-off mock (Fleet + Onboarding, Direction A). Match its structure and token usage.

### Fleet (home) — this screen IS the product pitch
1. **Page head:** title "Fleet" + one-line subtitle ("Every harness on this machine, and how far each has drifted from your source of truth.") + primary action "Recompile all" (right).
2. **Summary strip:** a single elevated bar, cells divided by hairline inset, showing: Harnesses (n) · Projects tracked (n) · Drifted (n configs, `--warning`) · Coverage (%) · Last compiled (relative). Big-metric type, tabular-nums, uppercase micro-labels.
3. **Matrix table:** rows = harnesses (mono monogram tile + name + mono version), columns = scopes (Global, then each tracked project). Cells = status chip: `In sync` (success) / `Drift N` (warning) / `Not configured` (subtle) / `Not installed` (subtle, dimmed). Row hover = `--accent-light`. Row click → Drift filtered to that harness; cell click → Configure at that scope.

### Drift — actionable, never a dead-end
Items grouped by project → harness. Each item shows: classification badge (repairable-inside-markers / user-edited-outside / missing / orphaned), an inline **mono diff viewer** (syntax-highlighted, red/green gutters using `--danger`/`--success` tints), and a per-item **Fix** button that previews the exact plan before applying. Header offers **Fix all** (dry-run preview first). User-content drift offers only Acknowledge / Review — never silent overwrite. Every row has an action.

### Configure
Monaco YAML editor (left/main) + a structured side panel (plugins, MCP servers, instruction slots, permissions) that round-trips to the YAML. Empty state = the **import flow** entry point ("Scan this machine"), not a blank template.

### Onboarding (first run) — the highest-craft screen
Full-bleed within the window (no app sidebar yet — it's a wizard). Sequence:
1. Scan progress ("Machine scan complete · 1.8s", azure pulse eyebrow).
2. **The sprawl reveal:** honest headline ("You run 5 harnesses. *They don't agree.*", the disagreement clause in azure), lede explaining "we read the config you already have — no authoring required", then a 4-up **stat row** (harnesses found / config files / overlapping instruction sets [warning] / direct conflicts [danger]).
3. **Convergence map:** source harness chips (each with file counts, drift counts in warning) → converging lines → a single `harness.yaml` card (mono preview: plugins/mcp-servers/skills counts in azure). Schematic, not heavy.
4. **Conflicts list:** concrete, specific rows in warning tint ("'Run tests before commit' appears in 3 tools with 2 wordings"; "MCP server `github` points at two commands"; "Copilot allows `rm -rf` where Claude Code denies it").
5. **CTA:** "Preview harness.yaml" (primary) + "Explore read-only" (ghost) + note "Nothing is written until you confirm." Declining leaves a fully usable read-only app.

### Comparator / Observatory / Marketplace / Settings
Re-skin existing data behavior onto `packages/ui` + these tokens. Security folds into Settings. No new features, no external-service affordances.

---

## 7. Component library (`packages/ui`) — minimum inventory

Build these token-driven, borderless-by-default (surface via `--bg-elevated`/`--bg-surface` + `--shadow-sm`, no neutral outline). Salvage the typed-wrapper pattern + CommandPalette from branch `c/vigorous-hermann-f3b4ea` (`apps/desktop/src/components/ui/`, `components/CommandPalette.tsx`) — re-token to Direction A, do not carry the old indigo palette.

- `Button` (primary=azure fill+white / ghost=elevated / danger), `Sidebar`+`NavItem`, `SummaryStrip`, `Matrix`/`Table`, `StatusChip` (success/warning/danger/subtle), `DiffViewer` (mono), `Modal` (one implementation, kills the 3 legacy modal styles), `Toast`, `EmptyState`, `Stat`, `Card`, form controls (input/select/toggle), `CommandPalette`.

Every v2 page uses only these + token vars for themed properties. Theme toggle re-themes **every** page — no page may hardcode its own palette (the old Board mistake is banned).

---

## 8. Verification for any UI change

1. Build the screen, then Playwright-screenshot **dark + light** at 1440 / 1024 / 768.
2. Check against §1 (anti-slop) and §2–§7 before requesting review.
3. Final validation for desktop = `pnpm install:desktop`, launch the real `.app` (not a browser), confirm not-blank and theme toggle works. (macOS 26 release builds blank — use the debug binary + dev server; see repo memory.)
4. Contrast: azure text on light MUST use `--accent-text` (#1668A6). Verify 4.5:1 for any small text.
