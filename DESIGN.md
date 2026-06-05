# Design System: Linear (linear.app)

## 1. Visual Theme & Atmosphere

Linear's visual identity is built on a single disciplined conviction: that software for serious engineering work must feel like the tool itself — precise, fast, and without ornament. The marketing canvas is Marketing Black (`#08090a`), a color so close to absolute black that it reads as a void rather than a surface. Within that void, a single violet accent (`#5e6ad2`, Indigo) functions as the system's entire chromatic signature — every interactive element, every call to action, every moment of user intent flows through this one color. Nothing else competes for attention. The result is an interface that communicates confidence through restraint.

Typography is Inter Variable throughout — but not the Inter you know from a thousand generic dashboards. Linear uses Inter with two non-negotiable OpenType features: `"cv01"` (single-story 'a') and `"ss03"` (geometric alternates). These glyph alternates transform the typeface from a utility workhorse into something distinctly engineered and slightly geometric, closer to a technical instrument than a consumer product. More critically, Linear uses weight **510** — a custom point between Regular (400) and Semibold (600) that is available only through Inter Variable. Weight 510 reads as emphasis without the heaviness of a semibold; it is precise, not loud. This choice at this weight is Linear's single most recognizable typographic decision.

Elevation in the dark-first system is achieved through a philosophy Linear calls luminance stacking: because dark surfaces have no "overhead light" to cast dark shadows downward, elevation is expressed by making surfaces progressively lighter (more luminous). A panel floating above the base layer gets a slightly higher `rgba(255,255,255,...)` background — not a drop shadow. Shadows are used only for floating elements (popovers, modals) and even there they are multi-layer composites that simulate depth through careful opacity graduation rather than a single strong shadow. The result is an interface that feels three-dimensional without feeling heavy.

**Key Characteristics:**
- Dark-first design: Marketing Black `#08090a` as the primary canvas — every element is designed for dark first
- Single violet accent: Indigo `#5e6ad2` as the exclusive interactive signal — links, CTAs, focus, progress
- Inter Variable with `"cv01"` + `"ss03"` OpenType features on every text element — non-negotiable
- Weight **510** for UI emphasis — between regular and semibold, available only in Inter Variable
- Luminance stacking for elevation: brighter surfaces are higher, never dark drop-shadows
- Progressive negative tracking: -1.584px at 72px tightening proportionally to normal below 16px
- Borders as transparent white overlays: `rgba(255,255,255,0.02)` to `rgba(255,255,255,0.08)`
- Controlled, snappy motion: 100-200ms default interactions, nothing bouncy, nothing springy
- Berkeley Mono for code — the premium monospace choice that matches Linear's engineering aesthetic
- Dual-mode completeness: every token maps to a light mode equivalent, dark is simply the default

---

## 2. Color System & Tokens

### Dark Theme (Primary)

| Token | Name | Hex / RGBA | Role | CSS Variable |
|-------|------|-----------|------|-------------|
| `bg-marketing` | Marketing Black | `#08090a` | Marketing page canvas, deepest void | `--color-bg-marketing` |
| `bg-panel` | Panel Dark | `#0f1011` | Application panel backgrounds, nav | `--color-bg-panel` |
| `bg-level3` | Level 3 Surface | `#191a1b` | Raised surfaces, second-level panels | `--color-bg-level3` |
| `bg-secondary` | Secondary Surface | `#1f2023` | Cards, input fills, hover surfaces | `--color-bg-secondary` |
| `text-primary` | White Primary | `#f7f8f8` | Headlines, primary UI text | `--color-text-primary` |
| `text-secondary` | Light Secondary | `#d0d6e0` | Body text, descriptions, subtitles | `--color-text-secondary` |
| `text-tertiary` | Muted Gray | `#8a8f98` | Captions, metadata, nav labels inactive | `--color-text-tertiary` |
| `text-quaternary` | Dim Gray | `#62666d` | Disabled text, placeholder, decorative | `--color-text-quaternary` |
| `accent-primary` | Indigo | `#5e6ad2` | Primary CTAs, links, active states | `--color-accent-primary` |
| `accent-hover` | Accent Violet | `#828fff` | Hover state on indigo elements | `--color-accent-hover` |
| `accent-light` | Violet Light | `#a8b1ff` | Gradient text, soft accent moments | `--color-accent-light` |
| `status-success` | Success Green | `#27a644` | In-progress issue status | `--color-status-success` |
| `status-complete` | Emerald | `#10b981` | Done/completed status | `--color-status-complete` |
| `status-warning` | Amber | `#f59e0b` | Warning states | `--color-status-warning` |
| `status-error` | Red | `#e53935` | Error states, destructive | `--color-status-error` |
| `border-micro` | Border Micro | `rgba(255,255,255,0.02)` | Hairline separators, barely-there divisions | `--color-border-micro` |
| `border-subtle` | Border Subtle | `rgba(255,255,255,0.05)` | Card borders, input outlines at rest | `--color-border-subtle` |
| `border-standard` | Border Standard | `rgba(255,255,255,0.08)` | Nav border-bottom, modal outlines, dividers | `--color-border-standard` |
| `inset-light` | Inset Light | `rgba(0,0,0,0.03)` | Recessed panel inset shadow (shallow) | `--color-inset-light` |
| `inset-deep` | Inset Deep | `rgba(0,0,0,0.4)` | Recessed panel inset shadow (deep) | `--color-inset-deep` |
| `overlay` | Modal Backdrop | `rgba(0,0,0,0.5)` | Modal/dialog backdrop | `--color-overlay` |

### Light Theme (Alternate)

| Token | Hex (Light) | Maps from Dark | CSS Variable |
|-------|------------|----------------|-------------|
| `bg-marketing` | `#f7f8f8` | `#08090a` | `--color-bg-marketing` |
| `bg-panel` | `#ffffff` | `#0f1011` | `--color-bg-panel` |
| `bg-level3` | `#f0f1f2` | `#191a1b` | `--color-bg-level3` |
| `bg-secondary` | `#e8e9eb` | `#1f2023` | `--color-bg-secondary` |
| `text-primary` | `#08090a` | `#f7f8f8` | `--color-text-primary` |
| `text-secondary` | `#2c2e33` | `#d0d6e0` | `--color-text-secondary` |
| `text-tertiary` | `#5a5f6b` | `#8a8f98` | `--color-text-tertiary` |
| `text-quaternary` | `#8a8f98` | `#62666d` | `--color-text-quaternary` |
| `accent-primary` | `#5e6ad2` | `#5e6ad2` | `--color-accent-primary` |
| `accent-hover` | `#4b57c8` | `#828fff` | `--color-accent-hover` |
| `accent-light` | `#7b89f0` | `#a8b1ff` | `--color-accent-light` |
| `border-micro` | `rgba(0,0,0,0.03)` | `rgba(255,255,255,0.02)` | `--color-border-micro` |
| `border-subtle` | `rgba(0,0,0,0.06)` | `rgba(255,255,255,0.05)` | `--color-border-subtle` |
| `border-standard` | `rgba(0,0,0,0.1)` | `rgba(255,255,255,0.08)` | `--color-border-standard` |
| `overlay` | `rgba(0,0,0,0.5)` | `rgba(0,0,0,0.5)` | `--color-overlay` |

### Contrast Ratios (WCAG AA)

| Pair | Foreground | Background | Ratio | Pass AA | Pass AAA |
|------|-----------|-----------|-------|---------|----------|
| Primary text on marketing black | `#f7f8f8` | `#08090a` | 18.9:1 | Yes | Yes |
| Primary text on panel dark | `#f7f8f8` | `#0f1011` | 16.1:1 | Yes | Yes |
| Secondary text on marketing black | `#d0d6e0` | `#08090a` | 12.4:1 | Yes | Yes |
| Tertiary text on marketing black | `#8a8f98` | `#08090a` | 5.4:1 | Yes | No |
| Quaternary text on marketing black | `#62666d` | `#08090a` | 3.1:1 | FAIL (decorative/disabled only) | No |
| Indigo on marketing black | `#5e6ad2` | `#08090a` | 5.2:1 | Yes | No |
| White on indigo button | `#f7f8f8` | `#5e6ad2` | 3.6:1 | Passes for large/bold text (18px+ / bold 14px+) | No |
| Accent violet on dark | `#828fff` | `#08090a` | 6.1:1 | Yes | No |
| Success green on dark | `#27a644` | `#08090a` | 3.4:1 | Passes for UI components (3:1) | No |

> **Important:** `#62666d` (Quaternary) at 3.1:1 is below WCAG AA for text — use only for decorative, disabled, or placeholder text. For any text conveying information use tertiary `#8a8f98` (5.4:1) minimum.
> **Important:** White-on-indigo button (`#f7f8f8` on `#5e6ad2`) is 3.6:1. Passes for large text (>=18px) or bold text (>=14px bold). For small body-weight button labels, use weight 510 which qualifies as "bold" for contrast purposes at 14px+.

### Gradients

| Name | Value | Use |
|------|-------|-----|
| Indigo glow | `radial-gradient(ellipse at 50% 0%, rgba(94,106,210,0.2) 0%, transparent 60%)` | Hero section ambient glow behind headline |
| Violet fade | `linear-gradient(180deg, rgba(130,143,255,0.1) 0%, transparent 100%)` | Feature section subtle tint overlay |
| Surface lift | `linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)` | Elevated panel gradient (luminance stacking) |
| Text shimmer | `linear-gradient(90deg, #828fff 0%, #a8b1ff 50%, #828fff 100%)` | Gradient text accents in hero headlines |
| Dark vignette | `radial-gradient(ellipse at center, transparent 40%, rgba(8,9,10,0.6) 100%)` | Edge vignette on full-bleed backgrounds |

---

## 3. Typography System

### Font Stack

| Role | Family | Fallbacks | CSS Variable |
|------|--------|-----------|-------------|
| Display | `Inter Variable` | `SF Pro Display, system-ui, Segoe UI, Helvetica, Arial, sans-serif` | `--font-display` |
| Body / UI | `Inter Variable` | `SF Pro Display, system-ui, Segoe UI, Helvetica, Arial, sans-serif` | `--font-body` |
| Mono | `Berkeley Mono` | `SF Mono, Consolas, Monaco, monospace` | `--font-mono` |

**OpenType Features — THE NON-NEGOTIABLE PAIR:**
- `"cv01"` — Activates the single-story 'a' glyph. Standard Inter uses a double-story 'a'; `cv01` switches to the cleaner, more geometric single-story form that reads as engineered and precise.
- `"ss03"` — Activates geometric alternates across multiple characters, creating a more uniform, systematic look.
- **These two features MUST be applied together to every Inter Variable element**. Omitting them renders standard Inter — visually the wrong typeface. Apply as `fontFeatureSettings: '"cv01", "ss03"'`.

### Weight System (Linear's Typographic Signature)

| Weight | Value | Role |
|--------|-------|------|
| De-emphasis | 300 | Deliberate lightness for secondary captions, footnotes |
| Reading | 400 | Long-form body text, descriptions |
| **UI Emphasis** | **510** | **THE SIGNATURE — buttons, labels, UI text, navigation** |
| Strong Emphasis | 590 | Card titles, emphasized headings |
| Display | 590-700 | Hero headlines at display-xl and above |

> **Weight 510 is Linear's most distinctive typographic decision.** It sits precisely between Regular (400) and Semibold (600) and is only accessible via Inter Variable's continuous weight axis. At this weight, UI labels and navigation items read as intentional and authoritative without the visual density of a true semibold. Never substitute 500 or 600 — the difference is visible and the signature is lost. Test with: `font-variation-settings: 'wght' 510`.

### Progressive Tracking Table

Linear applies negative letter-spacing that increases proportionally with text size. Larger text gets tighter tracking; below 16px returns to normal. This creates visual cohesion when display and body text appear together.

| Size | Letter Spacing | Ratio Applied |
|------|---------------|---------------|
| 72px | -1.584px | -0.022em |
| 64px | -1.408px | -0.022em |
| 48px | -1.056px | -0.022em |
| 32px | -0.704px | -0.022em |
| 20px | -0.24px | -0.012em |
| 16px | -0.165px | -0.010em |
| 14px and below | normal (0) | — |

### Type Scale

| Token | Size | Weight | Line Height | Letter Spacing | Fluid (clamp) | CSS Variable |
|-------|------|--------|-------------|----------------|---------------|-------------|
| `display-xl` | 72px | 590 | 1.0 | -1.584px | `clamp(40px, 5.5vw, 72px)` | `--text-display-xl` |
| `display-lg` | 64px | 590 | 1.0 | -1.408px | `clamp(36px, 5vw, 64px)` | `--text-display-lg` |
| `display-md` | 48px | 510 | 1.0 | -1.056px | `clamp(28px, 3.75vw, 48px)` | `--text-display-md` |
| `heading-lg` | 32px | 510 | 1.1 | -0.704px | `clamp(24px, 2.5vw, 32px)` | `--text-heading-lg` |
| `heading-md` | 24px | 510 | 1.2 | -0.48px | `clamp(20px, 2vw, 24px)` | `--text-heading-md` |
| `heading-sm` | 20px | 510 | 1.3 | -0.24px | `clamp(18px, 1.6vw, 20px)` | `--text-heading-sm` |
| `body-lg` | 18px | 400 | 1.6 | -0.165px | — | `--text-body-lg` |
| `body-md` | 16px | 400 | 1.5 | -0.165px | — | `--text-body-md` |
| `body-emphasis` | 16px | 510 | 1.5 | -0.165px | — | `--text-body-emphasis` |
| `body-sm` | 14px | 400 | 1.5 | normal | — | `--text-body-sm` |
| `small` | 13px | 400 | 1.4 | normal | — | `--text-small` |
| `caption` | 12px | 510 | 1.4 | normal | — | `--text-caption` |
| `micro` | 11px | 510 | 1.3 | normal | — | `--text-micro` |
| `tiny` | 10px | 510 | 1.2 | normal | — | `--text-tiny` |
| `link-nav` | 14px | 510 | 2.67 | normal | — | `--text-link-nav` |
| `code-md` | 14px | 510 | 1.6 | normal | — | `--text-code-md` |
| `code-sm` | 12px | 510 | 1.6 | normal | — | `--text-code-sm` |

> `link-nav` (14px/510/line-height 2.67) produces the 40px touch target for navigation items without adding padding.

### Typography Principles
- **Weight 510 is the signature — never 500 or 600**: The precision of 510 is visible. It requires Inter Variable and `font-variation-settings: 'wght' 510`. Substituting 500 makes UI labels too light; 600 makes them too heavy. 510 is the only correct value.
- **`"cv01" + "ss03"` globally on all Inter text**: These OpenType features change the visual identity of the typeface. Applied via `font-feature-settings: "cv01", "ss03"` in the `:root` body rule so every element inherits them. Never override to remove them.
- **Progressive tracking**: Letter-spacing is not decorative — it compensates for the optical illusion that makes large letterforms look too loose. The tighter the size, the tighter the tracking, creating uniform density across the scale.
- **Line-height compression at display**: Display sizes use 1.0 line-height (no gap between lines). As size decreases, line-height opens to 1.6 for body text readability. Never use 1.0 below heading-md (24px).
- **Berkeley Mono for code**: The premium monospace pairs Linear's engineering aesthetic. Use at weight 510 with the same `"cv01", "ss03"` features for visual consistency.

---

## 4. Component Catalog

### 4.1 Buttons

**Primary Brand**
- Background: `#5e6ad2` → `var(--color-accent-primary)`
- Text: `#f7f8f8`
- Padding: `8px 16px`
- Border Radius: `6px` → `var(--radius-comfortable)`
- Font: 14-16px / 510 / Inter Variable with `"cv01", "ss03"`
- Border: none
- Hover: bg `#828fff` → `var(--color-accent-hover)`
- Transition: `background-color 150ms cubic-bezier(0.25,0.46,0.45,0.94)`

**Ghost**
- Background: transparent
- Text: `#d0d6e0` → `var(--color-text-secondary)`
- Padding: `8px 16px`
- Border Radius: `6px`
- Border: `1px solid rgba(255,255,255,0.08)`
- Font: 14px / 510 / Inter Variable with `"cv01", "ss03"`
- Hover: bg `rgba(255,255,255,0.05)`, border-color `rgba(255,255,255,0.12)`

**Subtle**
- Background: `rgba(255,255,255,0.02)` → `var(--color-border-micro)` (as bg)
- Text: `#d0d6e0`
- Padding: `8px 16px`
- Border Radius: `6px`
- Border: `1px solid rgba(255,255,255,0.05)`
- Font: 14px / 510 / Inter Variable
- Hover: bg `rgba(255,255,255,0.05)`

**Icon Circle**
- Background: transparent
- Width / Height: `32px`
- Border Radius: `50%`
- Padding: `0`
- Icon: 16px, `currentColor`
- Hover: bg `rgba(255,255,255,0.05)`

**Pill**
- Background: `rgba(94,106,210,0.15)`
- Text: `#828fff`
- Padding: `6px 14px`
- Border Radius: `9999px`
- Font: 13px / 510 / Inter Variable
- Hover: bg `rgba(94,106,210,0.25)`

**Small Toolbar**
- Background: transparent
- Text: `#8a8f98`
- Padding: `4px 8px`
- Border Radius: `4px`
- Font: 12px / 510 / Inter Variable
- Hover: bg `rgba(255,255,255,0.05)`, text `#d0d6e0`

### 4.2 Inputs

**Text Input**
- Background: `rgba(255,255,255,0.02)`
- Border: `1px solid rgba(255,255,255,0.05)` → `var(--color-border-subtle)`
- Border Radius: `6px` → `var(--radius-comfortable)`
- Padding: `12px 14px`
- Font: 14px / 400 / Inter Variable with `"cv01", "ss03"`
- Placeholder: `#62666d` → `var(--color-text-quaternary)`
- Label: 13px / 510 / `#8a8f98` — positioned above, `margin-bottom: 6px`
- Helper text: 12px / 400 / `#62666d` — below input
- Focus: border-color `#5e6ad2`, box-shadow `0 0 0 2px rgba(94,106,210,0.4), 0 0 0 4px rgba(94,106,210,0.2)`

**Select** — same as Text Input, chevron icon `#8a8f98` right-aligned
**Textarea** — same as Text Input, `min-height: 96px`, `resize: vertical`
**Checkbox** — 16x16px, `border-radius: 4px`, checked bg `#5e6ad2`, check `#f7f8f8`, border `1px solid rgba(255,255,255,0.08)`
**Radio** — 16x16px, `border-radius: 50%`, selected dot `#5e6ad2`, border `1px solid rgba(255,255,255,0.08)`
**Toggle / Switch** — 36x20px track, 16px thumb. Off: track `rgba(255,255,255,0.08)`, On: track `#5e6ad2`, thumb `#f7f8f8`

### 4.3 Cards

**Default Card**
- Background: `rgba(255,255,255,0.05)` (luminance level 1 lift)
- Border: `1px solid rgba(255,255,255,0.05)`
- Border Radius: `8px` → `var(--radius-card)`
- Padding: `24px`
- Shadow: none (luminance stacking, not drop shadow)
- Hover: bg opacity increases to `rgba(255,255,255,0.07)`, transition 150ms

**Panel Card**
- Background: `#0f1011` → `var(--color-bg-panel)`
- Border: `1px solid rgba(255,255,255,0.08)`
- Border Radius: `12px` → `var(--radius-panel)`
- Padding: `24px`
- Shadow: `rgba(0,0,0,0.15) 0 4px 12px, rgba(0,0,0,0.2) 0 8px 24px, inset 0 0 0 1px rgba(255,255,255,0.08)`

**Feature Card**
- Background: `rgba(255,255,255,0.03)`
- Border: `1px solid rgba(255,255,255,0.08)`
- Border Radius: `12px`
- Padding: `32px`
- Hover: bg `rgba(255,255,255,0.05)`, transition 150ms

### 4.4 Navigation

**Top Nav / Header**
- Background: `rgba(8,9,10,0.85)` with `backdrop-filter: blur(12px) saturate(180%)`
- Height: `64px`
- Position: `sticky`, `top: 0`, `z-index: 50`
- Border-bottom: `1px solid rgba(255,255,255,0.08)`
- Logo: Linear wordmark / logomark, left-aligned, 24px height
- Links: 14px / 510 / `#8a8f98` with `"cv01", "ss03"`. Hover: `#d0d6e0`. Transition 150ms
- CTA: Primary Brand button right side
- Mobile: hamburger icon → full-screen overlay

**App Sidebar**
- Background: `#0f1011` → `var(--color-bg-panel)`
- Width: `240px`
- Border-right: `1px solid rgba(255,255,255,0.05)`
- Nav items: 14px / 510, padding `8px 12px`, radius `6px`, inactive `#8a8f98`, active bg `rgba(255,255,255,0.07)` + text `#f7f8f8`

**Footer**
- Background: `#0f1011`
- 4-column grid: Product + Developers + Company + Legal
- Links: 14px / 400 / `#8a8f98`. Hover: `#d0d6e0`
- Border-top: `1px solid rgba(255,255,255,0.05)`

### 4.5 Modals & Dialogs

- Overlay: `rgba(0,0,0,0.5)` → `var(--color-overlay)`
- Container: bg `#191a1b`, radius `12px`, shadow Level 4 (see Section 7), max-width `560px`
- Border: `1px solid rgba(255,255,255,0.08)`
- Header: `heading-md` (24px/510) with `"cv01", "ss03"`, close button top-right (Icon Circle)
- Body: padding `24px`, overflow-y auto if content exceeds 70vh
- Footer: padding `16px 24px`, buttons right-aligned, `gap: 8px`
- Enter: opacity 0→1 + scale 0.96→1.0, 300ms `cubic-bezier(0.165,0.84,0.44,1)`

### 4.6 Dropdowns & Menus

- Container: bg `#191a1b`, border `1px solid rgba(255,255,255,0.08)`, radius `8px`
- Shadow: `rgba(0,0,0,0.15) 0 4px 12px, rgba(0,0,0,0.2) 0 8px 24px, inset 0 0 0 1px rgba(255,255,255,0.08)`
- Item: padding `8px 12px`, font 14px/400 with `"cv01", "ss03"`, color `#d0d6e0`
- Item hover: bg `rgba(255,255,255,0.05)`, text `#f7f8f8`
- Active item: bg `rgba(94,106,210,0.15)`, text `#828fff`
- Divider: `1px solid rgba(255,255,255,0.05)`
- Group label: 12px/510/`#62666d`, padding `6px 12px`

### 4.7 Badges & Tags (Pills)

| Variant | Background | Text | Border | Radius | Padding |
|---------|-----------|------|--------|--------|---------|
| Success / In Progress | `rgba(39,166,68,0.15)` | `#27a644` | none | `9999px` | `0 10px` (+ 4px top/bottom) |
| Complete | `rgba(16,185,129,0.15)` | `#10b981` | none | `9999px` | `0 10px` |
| Neutral | `rgba(255,255,255,0.05)` | `#d0d6e0` | none | `9999px` | `0 10px` |
| Accent / Indigo | `rgba(94,106,210,0.15)` | `#828fff` | none | `9999px` | `0 10px` |
| Warning | `rgba(245,158,11,0.15)` | `#f59e0b` | none | `9999px` | `0 10px` |
| Error | `rgba(229,57,53,0.1)` | `#e53935` | none | `9999px` | `0 10px` |

> All pills use Inter Variable 12px/510 with `"cv01", "ss03"`, line-height 1.4, min-height 24px.

### 4.8 Tooltips

- Background: `#191a1b`
- Border: `1px solid rgba(255,255,255,0.08)`
- Text: `#d0d6e0`, 12px / 510 with `"cv01", "ss03"`
- Radius: `6px`
- Padding: `6px 10px`
- Arrow: `5px`, matches bg
- Max width: `260px`
- Shadow: `rgba(0,0,0,0.2) 0 4px 12px`

### 4.9 Toasts & Notifications

- Container: bg `#191a1b`, border `1px solid rgba(255,255,255,0.08)`, radius `8px`, padding `14px 16px`, max-width `360px`
- Shadow: `rgba(0,0,0,0.2) 0 8px 24px`
- Icon: 16px, color per variant (success `#27a644` / warning `#f59e0b` / error `#e53935` / info `#828fff`)
- Title: 14px / 510 / `#f7f8f8` with `"cv01", "ss03"`
- Message: 13px / 400 / `#8a8f98` with `"cv01", "ss03"`
- Close button: Icon Circle 24px, top-right
- Position: `bottom-right`, offset `16px` from edges
- Stack: `gap: 8px` between stacked toasts, max 3 visible
- Enter: `translateY(8px)→0` + opacity 0→1, 200ms `cubic-bezier(0.165,0.84,0.44,1)`

### 4.10 Tables

- Header: bg `rgba(255,255,255,0.02)`, text 12px/510/`#62666d` with `"cv01", "ss03"`, border-bottom `1px solid rgba(255,255,255,0.08)`
- Row: bg transparent, hover bg `rgba(255,255,255,0.03)`, border-bottom `1px solid rgba(255,255,255,0.05)`
- Cell: padding `10px 16px`, text 14px/400/`#d0d6e0`
- Striped variant: alternate row bg `rgba(255,255,255,0.02)`

### 4.11 Tabs

- Container: border-bottom `1px solid rgba(255,255,255,0.08)`
- Tab inactive: padding `10px 16px`, font 14px/510 with `"cv01", "ss03"`, color `#8a8f98`
- Tab active: color `#f7f8f8`, border-bottom `2px solid #5e6ad2`
- Tab hover: color `#d0d6e0`
- Transition: color 150ms, border-color 150ms

### 4.12 Avatars

| Size | Dimensions | Font Size | Radius |
|------|-----------|-----------|--------|
| xs | 20px | 10px | 4px |
| sm | 24px | 11px | 6px |
| md | 32px | 13px | 8px |
| lg | 40px | 16px | 9999px |
| xl | 56px | 22px | 9999px |

### 4.13 Pagination

- Button: 28x28px, radius `4px`, font 13px/510 with `"cv01", "ss03"`
- Default: bg transparent, text `#8a8f98`
- Active: bg `rgba(94,106,210,0.15)`, text `#828fff`
- Hover: bg `rgba(255,255,255,0.05)`, text `#d0d6e0`
- Disabled: opacity 0.35, cursor `not-allowed`
- Gap: `4px`

### 4.14 Progress & Loading

- Progress bar: height `2px`, track `rgba(255,255,255,0.08)`, fill `#5e6ad2`, radius `9999px`
- Spinner: 16px, `#5e6ad2`, stroke 1.5px, animation `spin 700ms linear infinite`
- Skeleton: bg `rgba(255,255,255,0.05)`, shimmer `linear-gradient(90deg, transparent, rgba(255,255,255,0.04), transparent)`, radius matching component, animation `shimmer 1.8s infinite`

---

## 5. Component State Matrix

| Component | Default | Hover | Active/Pressed | Focus | Disabled | Loading | Error |
|-----------|---------|-------|---------------|-------|----------|---------|-------|
| **Button Primary** | bg `#5e6ad2` | bg `#828fff`, 150ms | bg `#4b57c8`, scale(0.98) | ring `0 0 0 2px rgba(94,106,210,0.4), 0 0 0 4px rgba(94,106,210,0.2)` | bg `#5e6ad2`, opacity 0.4, `not-allowed` | spinner `#f7f8f8` 14px + label opacity 0.6 | — |
| **Button Ghost** | border `rgba(255,255,255,0.08)` | bg `rgba(255,255,255,0.05)`, border `rgba(255,255,255,0.12)` | bg `rgba(255,255,255,0.08)`, scale(0.98) | ring `0 0 0 2px rgba(94,106,210,0.4)` | opacity 0.35, `not-allowed` | spinner `#8a8f98` | — |
| **Button Subtle** | bg `rgba(255,255,255,0.02)` | bg `rgba(255,255,255,0.05)` | bg `rgba(255,255,255,0.08)`, scale(0.98) | ring `0 0 0 2px rgba(94,106,210,0.4)` | opacity 0.35, `not-allowed` | spinner `#8a8f98` | — |
| **Input Text** | border `rgba(255,255,255,0.05)` | border `rgba(255,255,255,0.1)` | — | border `#5e6ad2`, ring `0 0 0 2px rgba(94,106,210,0.4), 0 0 0 4px rgba(94,106,210,0.2)` | bg `rgba(255,255,255,0.01)`, opacity 0.5, `not-allowed` | — | border `#e53935`, ring `0 0 0 2px rgba(229,57,53,0.3)` |
| **Checkbox** | border `rgba(255,255,255,0.08)` | border `rgba(255,255,255,0.2)` | — | ring `0 0 0 2px rgba(94,106,210,0.4)` | opacity 0.35 | — | border `#e53935` |
| **Card Default** | bg `rgba(255,255,255,0.05)` | bg `rgba(255,255,255,0.07)`, 150ms | bg `rgba(255,255,255,0.06)` | ring `0 0 0 2px rgba(94,106,210,0.4)` | opacity 0.4 | skeleton shimmer | — |
| **Link** | color `#5e6ad2` | color `#828fff`, underline | color `#4b57c8` | ring `0 0 0 2px rgba(94,106,210,0.4)`, offset 2px | color `#62666d`, no pointer | — | — |
| **Tab** | color `#8a8f98`, no indicator | color `#d0d6e0` | color `#f7f8f8`, `2px solid #5e6ad2` bottom | ring inset `0 0 0 2px rgba(94,106,210,0.4)` | opacity 0.35 | — | — |
| **Select** | border `rgba(255,255,255,0.05)` | border `rgba(255,255,255,0.1)` | — | border `#5e6ad2`, ring indigo | opacity 0.5 | spinner `#5e6ad2` | border `#e53935` |
| **Toggle** | track `rgba(255,255,255,0.08)` | track `rgba(255,255,255,0.15)` (off) / `#828fff` (on) | — | ring `0 0 0 2px rgba(94,106,210,0.4)` | opacity 0.35 | — | — |

### Focus Ring Standard (Linear Multi-Layer)
```css
/* Primary interactive elements: button, input, card */
box-shadow:
  0 0 0 2px rgba(94, 106, 210, 0.4),
  0 0 0 4px rgba(94, 106, 210, 0.2);
outline: none;

/* Links and small elements */
outline: 2px solid rgba(94, 106, 210, 0.6);
outline-offset: 2px;
```

### Disabled Pattern
```css
opacity: 0.4;
cursor: not-allowed;
pointer-events: none;
```

### Error Input Pattern
```css
border-color: #e53935;
box-shadow:
  0 0 0 2px rgba(229, 57, 53, 0.3),
  0 0 0 4px rgba(229, 57, 53, 0.15);
```

---

## 6. Layout & Spacing System

### Spacing Scale

| Token | Value | Tailwind | CSS Variable | Use |
|-------|-------|---------|-------------|-----|
| `space-0` | 0px | `p-0` | `--space-0` | Reset |
| `space-px` | 1px | `p-px` | `--space-px` | Hairlines |
| `space-1` | 4px | `p-1` | `--space-1` | Icon gaps, micro padding |
| `space-2` | 8px | `p-2` | `--space-2` | Badge padding, toolbar item gap |
| `space-3` | 12px | `p-3` | `--space-3` | Input padding, sidebar nav item padding |
| `space-4` | 16px | `p-4` | `--space-4` | Button padding-x, card gap, section sub-gap |
| `space-5` | 20px | `p-5` | `--space-5` | Section padding mobile |
| `space-6` | 24px | `p-6` | `--space-6` | Card padding, modal body padding |
| `space-8` | 32px | `p-8` | `--space-8` | Feature card padding |
| `space-10` | 40px | `p-10` | `--space-10` | Section gap mobile |
| `space-12` | 48px | `p-12` | `--space-12` | Section gap tablet |
| `space-16` | 64px | `p-16` | `--space-16` | Section gap desktop |
| `space-20` | 80px | `p-20` | `--space-20` | Hero vertical padding |
| `space-24` | 96px | `p-24` | `--space-24` | Large section separation |

### Grid

| Property | Value | CSS Variable |
|----------|-------|-------------|
| Max width (marketing) | `1080px` | `--grid-max-width-marketing` |
| Max width (app) | `1280px` | `--grid-max-width-app` |
| Column count | 12 | `--grid-columns` |
| Gutter | `24px` | `--grid-gutter` |
| Margin (mobile) | `16px` | `--grid-margin-sm` |
| Margin (tablet) | `24px` | `--grid-margin-md` |
| Margin (desktop) | `auto` (centered) | `--grid-margin-lg` |

### Border Radius Scale (Linear's Exact Hierarchy)

| Token | Value | Tailwind | CSS Variable | Use |
|-------|-------|---------|-------------|-----|
| `radius-micro` | 2px | — | `--radius-micro` | Checkbox, very small tags |
| `radius-standard` | 4px | `rounded` | `--radius-standard` | Small toolbar buttons, table row indicators |
| `radius-comfortable` | 6px | `rounded-md` | `--radius-comfortable` | Buttons, inputs, small cards |
| `radius-card` | 8px | `rounded-lg` | `--radius-card` | Default cards, dropdowns, toasts |
| `radius-panel` | 12px | `rounded-xl` | `--radius-panel` | Panels, modals, feature cards |
| `radius-large` | 22px | — | `--radius-large` | Large decorative containers |
| `radius-pill` | 9999px | `rounded-full` | `--radius-pill` | Status badges, avatar (large) |
| `radius-circle` | 50% | — | `--radius-circle` | Icon Circle button, circular avatars |

---

## 7. Depth & Elevation

### Linear Elevation Philosophy: Luminance Stacking

> **Critical concept:** In a dark-first system, there is no overhead light source to cast shadows downward. Standard `box-shadow` values look unnatural and heavy against dark backgrounds. Linear instead uses **luminance stacking** — elevated elements have slightly more luminous (lighter) backgrounds. A popover is not "above" the page because it has a shadow; it is "above" because its surface is brighter.
>
> Shadows are used only for floating elements (Level 3+) and even then they simulate depth through multiple semi-transparent layers, not a single strong shadow. The key insight: stacking `rgba(0,0,0,...)` shadows works for light themes but looks like a punched hole on dark themes. Stacking `rgba(255,255,255,...)` backgrounds creates genuine depth.

### Elevation Levels

| Level | Purpose | Background | Border | Shadow |
|-------|---------|-----------|--------|--------|
| 0 — Canvas | Marketing page base | `#08090a` | none | none |
| 1 — Surface | Application base panels | `#0f1011` | none | none |
| 2 — Card | Raised card / content area | `rgba(255,255,255,0.05)` applied to Level 1 | `rgba(255,255,255,0.05)` | none |
| 3 — Popover | Dropdown, tooltip container | `#191a1b` | `rgba(255,255,255,0.08)` | `rgba(0,0,0,0.15) 0 4px 12px, rgba(0,0,0,0.2) 0 8px 24px, inset 0 0 0 1px rgba(255,255,255,0.08)` |
| 4 — Modal | Dialog, modal container | `#191a1b` | `rgba(255,255,255,0.08)` | `rgba(0,0,0,0.2) 0 0 0px 100vmax, rgba(0,0,0,0.3) 0 16px 48px, inset 0 0 0 1px rgba(255,255,255,0.1)` |
| 5 — Recessed | Inset panel (feels sunken) | `rgba(0,0,0,0.2)` applied to container | `rgba(0,0,0,0.3)` | `inset 0 0 0 1px rgba(0,0,0,0.4), inset 0 2px 4px rgba(0,0,0,0.3)` |

### Shadow Tokens

| Token | Value | CSS Variable | Use |
|-------|-------|-------------|-----|
| `shadow-none` | none | `--shadow-none` | Canvas, Level 0-1 |
| `shadow-card` | none (luminance only) | `--shadow-card` | Level 2 cards |
| `shadow-popover` | `rgba(0,0,0,0.15) 0 4px 12px, rgba(0,0,0,0.2) 0 8px 24px, inset 0 0 0 1px rgba(255,255,255,0.08)` | `--shadow-popover` | Level 3 floating elements |
| `shadow-modal` | `rgba(0,0,0,0.2) 0 16px 48px, rgba(0,0,0,0.3) 0 32px 72px, inset 0 0 0 1px rgba(255,255,255,0.1)` | `--shadow-modal` | Level 4 modal dialogs |
| `shadow-inset` | `inset 0 0 0 1px rgba(0,0,0,0.4), inset 0 2px 4px rgba(0,0,0,0.3)` | `--shadow-inset` | Level 5 recessed panels |
| `shadow-focus` | `0 0 0 2px rgba(94,106,210,0.4), 0 0 0 4px rgba(94,106,210,0.2)` | `--shadow-focus` | Focus ring for all interactive elements |

### Z-Index Scale

| Token | Value | CSS Variable | Use |
|-------|-------|-------------|-----|
| `z-base` | 0 | `--z-base` | Default content |
| `z-raised` | 1 | `--z-raised` | Lifted cards |
| `z-dropdown` | 10 | `--z-dropdown` | Dropdowns, context menus |
| `z-sticky` | 50 | `--z-sticky` | Sticky nav, table headers |
| `z-overlay` | 60 | `--z-overlay` | Modal backdrop |
| `z-modal` | 70 | `--z-modal` | Modal content |
| `z-popover` | 80 | `--z-popover` | Popovers, tooltips |
| `z-toast` | 90 | `--z-toast` | Toast notifications |
| `z-top` | 100 | `--z-top` | Skip-to-content, critical overlays |

---

## 8. Motion & Animation System

### Linear Motion Philosophy: Controlled and Snappy

> Linear's animations are fast, precise, and never playful. The interaction model is a professional tool — every transition must feel immediate and purposeful. There are no bouncy springs, no overshoot, no elastic callbacks. The `ease-linear-default` curve (`cubic-bezier(0.25,0.46,0.45,0.94)`, easeOutQuad) gives interactions a crisp start with a smooth settle. Modal entrances use `easeOutQuart` (`cubic-bezier(0.165,0.84,0.44,1)`) for a confident arrival. If an animation draws attention to itself, it is too slow or too bouncy — trim it.

### Duration Scale

| Token | Value | CSS Variable | Use |
|-------|-------|-------------|-----|
| `duration-instant` | 0ms | `--duration-instant` | Immediate state changes |
| `duration-micro` | 100ms | `--duration-micro` | Focus ring appearance, checkbox tick |
| `duration-fast` | 150ms | `--duration-fast` | Button hover, link color, border color |
| `duration-normal` | 200ms | `--duration-normal` | State changes, tab switches, badge transitions |
| `duration-moderate` | 300ms | `--duration-moderate` | Dropdown open, modal enter, panel slide |
| `duration-slow` | 500ms | `--duration-slow` | Page transitions, complex orchestration |

### Easing Functions

| Token | Value | CSS Variable | Use |
|-------|-------|-------------|-----|
| `ease-default` | `cubic-bezier(0.25, 0.46, 0.45, 0.94)` | `--ease-default` | General transitions (easeOutQuad — Linear's primary) |
| `ease-enter` | `cubic-bezier(0.165, 0.84, 0.44, 1)` | `--ease-enter` | easeOutQuart — modal/popover entrances |
| `ease-material` | `cubic-bezier(0.4, 0, 0.2, 1)` | `--ease-material` | Material default for repositioning |
| `ease-in` | `cubic-bezier(0.4, 0, 1, 1)` | `--ease-in` | Elements exiting — decelerate out |
| `ease-out` | `cubic-bezier(0, 0, 0.2, 1)` | `--ease-out` | Elements entering — no bounce |

> **Never use:** `cubic-bezier(0.34,1.56,0.64,1)` (spring/bounce curves). Linear is a work tool — bouncy animations break the professional, focused atmosphere.

### Common Transitions

| Interaction | Property | Duration | Easing |
|------------|----------|----------|--------|
| Button hover bg | `background-color` | 150ms | ease-default |
| Button active press | `transform (scale 0.98)` | 100ms | ease-material |
| Focus ring appear | `box-shadow` | 100ms | ease-default |
| Input focus border | `border-color, box-shadow` | 150ms | ease-default |
| Card hover | `background-color` | 150ms | ease-default |
| Dropdown open | `opacity, transform (translateY -4px→0)` | 200ms | ease-enter |
| Modal enter | `opacity 0→1, transform scale(0.96→1.0)` | 300ms | ease-enter |
| Modal exit | `opacity 1→0, transform scale(1.0→0.96)` | 200ms | ease-in |
| Toast enter | `transform (translateY 8px→0), opacity` | 200ms | ease-enter |
| Toast exit | `opacity, transform` | 150ms | ease-in |
| Nav bg on scroll | `background-color, backdrop-filter` | 200ms | ease-default |
| Tab indicator | `border-color` | 150ms | ease-default |

### Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

---

## 9. Icon System

| Property | Value |
|----------|-------|
| Library | Linear custom icons (internal) + Lucide React for generic UI |
| Default size | 16px |
| Stroke width | 1.5px |
| Color | `currentColor` (inherits from parent text) |
| Style | Outline, precise, no rounded caps at corners |

### Icon Sizes

| Token | Value | CSS Variable | Use |
|-------|-------|-------------|-----|
| `icon-xs` | 12px | `--icon-xs` | Inline, badges, micro indicators |
| `icon-sm` | 14px | `--icon-sm` | Toolbar icons, list item icons |
| `icon-md` | 16px | `--icon-md` | Default — buttons, nav, cards |
| `icon-lg` | 20px | `--icon-lg` | Feature items, heading companion icons |
| `icon-xl` | 24px | `--icon-xl` | Hero features, empty states |
| `icon-2xl` | 32px | `--icon-2xl` | Large empty states, onboarding |

### Feature Icon Container
- Square: `40px`, bg `rgba(94,106,210,0.12)`, icon `#828fff` 20px, radius `8px`
- Used in: feature grids, integration cards, empty states

---

## 10. Accessibility Contract

### Targets

| Criterion | Target | Standard |
|-----------|--------|----------|
| Color contrast (normal text) | 4.5:1 minimum | WCAG AA |
| Color contrast (large text >=18px / bold >=14px) | 3:1 minimum | WCAG AA |
| Color contrast (UI components, focus indicators) | 3:1 minimum | WCAG AA |
| Touch target size | 44x44px minimum | WCAG 2.5.8 |
| Focus indicator | multi-layer indigo ring, >3:1 contrast | WCAG 2.4.7 |
| Motion | Respect `prefers-reduced-motion` | WCAG 2.3.3 |

### Known Contrast Notes

| Element | Ratio | Notes |
|---------|-------|-------|
| Quaternary text `#62666d` on `#08090a` | 3.1:1 | Below AA for text. Use as placeholder/disabled only, never for informational copy. |
| White-on-indigo button `#f7f8f8` on `#5e6ad2` | 3.6:1 | Passes for large/bold text. Use weight 510 at 14px+ to qualify as bold threshold. |
| Indigo on dark `#5e6ad2` on `#08090a` | 5.2:1 | Passes AA for normal text — usable for links. |
| Tertiary `#8a8f98` on `#08090a` | 5.4:1 | Passes AA — minimum allowed for informational text. |

### Focus Management

- All interactive elements: multi-layer indigo focus ring (see Section 5)
- Focus order follows DOM order (left-to-right, top-to-bottom)
- Modal traps focus within dialog until Escape key or explicit close
- Skip-to-content link: `<a href="#main-content" class="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100]">`
- Sidebar and mobile nav keyboard-accessible with visible focus ring

### ARIA Patterns

| Component | Role | Key Attributes |
|-----------|------|---------------|
| Modal | `dialog` | `aria-modal="true"`, `aria-labelledby="dialog-title"` |
| Dropdown | `menu` / `menuitem` | `aria-expanded`, `aria-haspopup="true"` |
| Tabs | `tablist` / `tab` / `tabpanel` | `aria-selected`, `aria-controls`, `aria-orientation="horizontal"` |
| Toast | `status` or `alert` | `role="alert"` for errors, `role="status"` for info |
| Toggle | `switch` | `aria-checked` |
| Tooltip | `tooltip` | `aria-describedby` on trigger |
| Progress bar | `progressbar` | `aria-valuenow`, `aria-valuemin="0"`, `aria-valuemax="100"` |
| Status pill | `status` | `aria-label="Status: [value]"` on icon-only pills |

### Keyboard Navigation

| Component | Key | Action |
|-----------|-----|--------|
| Button | `Enter`, `Space` | Activate |
| Modal | `Escape` | Close, return focus to trigger |
| Dropdown | `Arrow Up/Down` | Navigate items |
| Dropdown | `Enter` | Select item |
| Dropdown | `Escape` | Close dropdown |
| Tabs | `Arrow Left/Right` | Switch tab |
| Checkbox | `Space` | Toggle |
| Toggle | `Space`, `Enter` | Toggle on/off |

---

## 11. Do's and Don'ts

### Do
1. Apply `font-feature-settings: "cv01", "ss03"` to every Inter Variable text element — globally via `:root` so every element inherits it automatically
2. Use weight **510** (via `font-variation-settings: 'wght' 510`) for all UI labels, navigation, buttons, and emphasis text — this is the signature weight, never substitute 500 or 600
3. Use Indigo `#5e6ad2` exclusively for interactive signals — links, CTAs, focus rings, active states — never as decoration
4. Express elevation through luminance stacking — brighter `rgba(255,255,255,...)` backgrounds for higher surfaces, not dark drop shadows
5. Use `rgba(255,255,255,...)` borders at three granular levels: 0.02 micro, 0.05 subtle, 0.08 standard — the transparency level communicates the hierarchy
6. Apply progressive negative tracking: -1.584px at 72px tightening proportionally, normal below 14px
7. Keep motion fast and linear: 100-150ms for micro-interactions, 200ms for state changes, 300ms max for entrances — no bouncy curves
8. Use Berkeley Mono at weight 510 with `"cv01", "ss03"` for code blocks — it matches the engineering aesthetic of the typeface
9. Map every dark token to a light equivalent — the system is dark-first but must be fully functional in light mode
10. Use the multi-layer focus ring (`0 0 0 2px rgba(94,106,210,0.4), 0 0 0 4px rgba(94,106,210,0.2)`) for all interactive elements — single-layer rings look too thin on dark backgrounds

### Don't
1. Don't use dark drop-shadows (`box-shadow: 0 4px 12px rgba(0,0,0,0.8)`) for elevation — on dark surfaces they punch holes instead of creating lift; stack luminance instead
2. Don't substitute weight 500 or 600 for weight 510 — the difference is visible, particularly in navigation labels and button text; 510 is the precise point that reads as "intentional" without heaviness
3. Don't omit `"cv01"` and `"ss03"` on any Inter text — without these features you are rendering standard Inter, which is visually a different typeface than Linear uses
4. Don't add bounce or spring curves to any animation — `cubic-bezier(0.34,1.56,0.64,1)` and similar overshoot curves are incompatible with Linear's controlled, professional motion language
5. Don't use solid hex borders in the dark theme — always use `rgba(255,255,255,...)` at the specified opacity levels so borders adapt naturally to any surface
6. Don't use `#62666d` (Quaternary) for informational text — it is 3.1:1 on dark backgrounds, below WCAG AA; use `#8a8f98` (5.4:1) as the minimum for readable text
7. Don't add secondary accent colors (orange, pink, teal) to general UI — the only accent is Indigo `#5e6ad2`; status colors (green, amber, red) exist only for data states
8. Don't use pill radius (`9999px`) for buttons — pills are reserved for status badges and tags only; buttons use `6px` (comfortable) for the flat, tool-like aesthetic
9. Don't center-align body paragraphs over 3 lines — left-align for reading comfort; centered text is for hero eyebrow labels and single-line captions only
10. Don't use the Accent Violet `#828fff` as the primary button color — it is hover only; the default Indigo `#5e6ad2` (with `#828fff` as hover) creates the proper depth-of-interaction signal

---

## 12. Responsive Behavior

### Breakpoints

| Token | Width | CSS | Tailwind | Key Changes |
|-------|-------|-----|----------|-------------|
| `sm` | 600px | `@media (min-width: 600px)` | `sm:` | 2-col grids unlock, stacked CTAs side-by-side |
| `md` | 768px | `@media (min-width: 768px)` | `md:` | Full nav visible, sidebar appears |
| `lg` | 1024px | `@media (min-width: 1024px)` | `lg:` | Full desktop layout, 3-col feature grids |
| `xl` | 1280px | `@media (min-width: 1280px)` | `xl:` | App max-width, generous gutters |
| `2xl` | 1536px | `@media (min-width: 1536px)` | `2xl:` | Extra breathing room |

### Responsive Type Scale

| Token | Mobile (<600) | Tablet (768) | Desktop (1024+) |
|-------|--------------|-------------|----------------|
| `display-xl` | 40px | 56px | 72px |
| `display-lg` | 36px | 48px | 64px |
| `display-md` | 28px | 36px | 48px |
| `heading-lg` | 24px | 28px | 32px |
| `heading-md` | 20px | 22px | 24px |

### Layout Shifts

| Component | Mobile (<768) | Tablet (768-1023) | Desktop (1024+) |
|-----------|--------------|-------------------|----------------|
| Nav | Hamburger → overlay drawer | Hamburger or full horizontal | Full horizontal, sticky |
| Hero | Stacked center, padding 20px | Stacked, padding 40px | Stacked or split, padding 80px |
| Feature grid | 1 column stacked | 2 columns | 3 columns |
| App sidebar | Hidden / bottom drawer | Collapsed icon-only (56px) | Full expanded (240px) |
| Cards | Full width | 2 columns | 3 columns |
| Footer | Stacked single column | 2x2 grid | 4 column grid |

### Touch Targets
- Minimum size: 44x44px
- Minimum gap between adjacent targets: 8px
- Mobile CTA buttons: full width, 48px min height
- Nav hamburger: 44x44px touch area
- Icon buttons: 44x44px touch area (visual icon may be 16px, but target is padded to 44px)

---

## 13. Code Snippets

### Button Primary (JSX + Tailwind)

```jsx
<button
  className="bg-[#5e6ad2] hover:bg-[#828fff] active:bg-[#4b57c8] active:scale-[0.98] text-[#f7f8f8] px-4 py-2 rounded-md text-sm transition-[background-color,box-shadow] duration-150 focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed"
  style={{
    fontFamily: '"Inter Variable", "SF Pro Display", system-ui, sans-serif',
    fontFeatureSettings: '"cv01", "ss03"',
    fontVariationSettings: "'wght' 510",
    boxShadow: 'none',
  }}
  onFocus={e => e.currentTarget.style.boxShadow = '0 0 0 2px rgba(94,106,210,0.4), 0 0 0 4px rgba(94,106,210,0.2)'}
  onBlur={e => e.currentTarget.style.boxShadow = 'none'}
>
  Start for free
</button>
```

### Card Component (JSX + Tailwind)

```jsx
<div
  className="rounded-lg p-6 border transition-colors duration-150"
  style={{
    background: 'rgba(255,255,255,0.05)',
    borderColor: 'rgba(255,255,255,0.05)',
  }}
  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.07)'}
  onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
>
  <h3
    className="text-[#f7f8f8] text-xl mb-2"
    style={{
      fontFeatureSettings: '"cv01", "ss03"',
      fontVariationSettings: "'wght' 510",
      letterSpacing: '-0.24px',
    }}
  >
    {title}
  </h3>
  <p
    className="text-[#8a8f98] text-sm leading-relaxed"
    style={{ fontFeatureSettings: '"cv01", "ss03"' }}
  >
    {description}
  </p>
</div>
```

### Sticky Nav (JSX + Tailwind)

```jsx
<header
  className="sticky top-0 z-50 h-16 border-b"
  style={{
    background: 'rgba(8,9,10,0.85)',
    backdropFilter: 'blur(12px) saturate(180%)',
    borderColor: 'rgba(255,255,255,0.08)',
  }}
>
  <nav className="max-w-[1080px] mx-auto px-6 h-full flex items-center justify-between">
    <img src="/linear-logo.svg" alt="Linear" className="h-6" />
    <div className="hidden md:flex items-center gap-6">
      {['Features', 'Changelog', 'Pricing', 'Blog'].map(link => (
        <a
          key={link}
          href={`/${link.toLowerCase()}`}
          className="text-sm text-[#8a8f98] hover:text-[#d0d6e0] transition-colors duration-150"
          style={{ fontFeatureSettings: '"cv01", "ss03"', fontVariationSettings: "'wght' 510" }}
        >
          {link}
        </a>
      ))}
    </div>
    <button
      className="bg-[#5e6ad2] hover:bg-[#828fff] text-[#f7f8f8] px-4 py-2 rounded-md text-sm transition-colors duration-150"
      style={{ fontFeatureSettings: '"cv01", "ss03"', fontVariationSettings: "'wght' 510" }}
    >
      Get Linear free
    </button>
  </nav>
</header>
```

### Status Pill Badge (JSX)

```jsx
<span
  className="inline-flex items-center rounded-full text-xs"
  style={{
    background: 'rgba(39,166,68,0.15)',
    color: '#27a644',
    padding: '4px 10px',
    fontFeatureSettings: '"cv01", "ss03"',
    fontVariationSettings: "'wght' 510",
  }}
>
  In Progress
</span>
```

### CSS Custom Properties (Root)

```css
:root {
  /* === BRAND === */
  --linear-indigo:       #5e6ad2;
  --linear-indigo-hover: #828fff;
  --linear-indigo-light: #a8b1ff;
  --linear-black:        #08090a;
  --linear-panel:        #0f1011;

  /* === BACKGROUNDS (Dark) === */
  --color-bg-marketing:  #08090a;
  --color-bg-panel:      #0f1011;
  --color-bg-level3:     #191a1b;
  --color-bg-secondary:  #1f2023;

  /* === TEXT (Dark) === */
  --color-text-primary:     #f7f8f8;
  --color-text-secondary:   #d0d6e0;
  --color-text-tertiary:    #8a8f98;
  --color-text-quaternary:  #62666d; /* decorative/disabled only — 3.1:1 */

  /* === ACCENT === */
  --color-accent-primary:  #5e6ad2;
  --color-accent-hover:    #828fff;
  --color-accent-light:    #a8b1ff;

  /* === STATUS === */
  --color-status-success:  #27a644;
  --color-status-complete: #10b981;
  --color-status-warning:  #f59e0b;
  --color-status-error:    #e53935;

  /* === BORDERS (transparent white) === */
  --color-border-micro:    rgba(255, 255, 255, 0.02);
  --color-border-subtle:   rgba(255, 255, 255, 0.05);
  --color-border-standard: rgba(255, 255, 255, 0.08);

  /* === INSET SHADOWS === */
  --color-inset-light: rgba(0, 0, 0, 0.03);
  --color-inset-deep:  rgba(0, 0, 0, 0.4);
  --color-overlay:     rgba(0, 0, 0, 0.5);

  /* === TYPOGRAPHY === */
  --font-display: 'Inter Variable', 'SF Pro Display', system-ui, 'Segoe UI', Helvetica, Arial, sans-serif;
  --font-body:    'Inter Variable', 'SF Pro Display', system-ui, 'Segoe UI', Helvetica, Arial, sans-serif;
  --font-mono:    'Berkeley Mono', 'SF Mono', Consolas, Monaco, monospace;
  --font-features: "cv01", "ss03"; /* Apply globally — never remove */
  --font-weight-reading:   400;
  --font-weight-ui:        510; /* THE SIGNATURE */
  --font-weight-strong:    590;
  --font-weight-display:   590;

  /* === SPACING === */
  --space-1:  4px;   --space-2:  8px;   --space-3:  12px;
  --space-4:  16px;  --space-5:  20px;  --space-6:  24px;
  --space-8:  32px;  --space-10: 40px;  --space-12: 48px;
  --space-16: 64px;  --space-20: 80px;  --space-24: 96px;

  /* === RADIUS === */
  --radius-micro:       2px;
  --radius-standard:    4px;
  --radius-comfortable: 6px;
  --radius-card:        8px;
  --radius-panel:       12px;
  --radius-large:       22px;
  --radius-pill:        9999px;
  --radius-circle:      50%;

  /* === SHADOWS (luminance stacking philosophy) === */
  --shadow-card:    none;
  --shadow-popover: rgba(0,0,0,0.15) 0 4px 12px, rgba(0,0,0,0.2) 0 8px 24px, inset 0 0 0 1px rgba(255,255,255,0.08);
  --shadow-modal:   rgba(0,0,0,0.2) 0 16px 48px, rgba(0,0,0,0.3) 0 32px 72px, inset 0 0 0 1px rgba(255,255,255,0.1);
  --shadow-inset:   inset 0 0 0 1px rgba(0,0,0,0.4), inset 0 2px 4px rgba(0,0,0,0.3);
  --shadow-focus:   0 0 0 2px rgba(94,106,210,0.4), 0 0 0 4px rgba(94,106,210,0.2);

  /* === MOTION === */
  --duration-micro:    100ms;
  --duration-fast:     150ms;
  --duration-normal:   200ms;
  --duration-moderate: 300ms;
  --duration-slow:     500ms;
  --ease-default: cubic-bezier(0.25, 0.46, 0.45, 0.94);  /* easeOutQuad — primary */
  --ease-enter:   cubic-bezier(0.165, 0.84, 0.44, 1);    /* easeOutQuart — entrances */
  --ease-material:cubic-bezier(0.4, 0, 0.2, 1);
  --ease-in:      cubic-bezier(0.4, 0, 1, 1);

  /* === Z-INDEX === */
  --z-base:     0;
  --z-raised:   1;
  --z-dropdown: 10;
  --z-sticky:   50;
  --z-overlay:  60;
  --z-modal:    70;
  --z-popover:  80;
  --z-toast:    90;
  --z-top:      100;

  /* === GRID === */
  --grid-max-width-marketing: 1080px;
  --grid-max-width-app:       1280px;
  --grid-gutter:   24px;
  --grid-columns:  12;
}

/* Apply OpenType features + weight 510 globally */
body {
  font-family: var(--font-body);
  font-feature-settings: "cv01", "ss03";
  color: var(--color-text-primary);
  background: var(--color-bg-marketing);
}

/* Light mode overrides */
.light, [data-theme="light"] {
  --color-bg-marketing:  #f7f8f8;
  --color-bg-panel:      #ffffff;
  --color-bg-level3:     #f0f1f2;
  --color-bg-secondary:  #e8e9eb;
  --color-text-primary:  #08090a;
  --color-text-secondary:#2c2e33;
  --color-text-tertiary: #5a5f6b;
  --color-text-quaternary: #8a8f98;
  --color-border-micro:   rgba(0,0,0,0.03);
  --color-border-subtle:  rgba(0,0,0,0.06);
  --color-border-standard:rgba(0,0,0,0.10);
  --color-accent-hover:   #4b57c8;
}
```

### Tailwind Config Extension

```js
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        linear: {
          indigo:       '#5e6ad2',
          'indigo-hover':'#828fff',
          'indigo-light':'#a8b1ff',
          black:         '#08090a',
          panel:         '#0f1011',
          'level3':      '#191a1b',
          secondary:     '#1f2023',
        },
        text: {
          primary:    '#f7f8f8',
          secondary:  '#d0d6e0',
          tertiary:   '#8a8f98',
          quaternary: '#62666d',
        },
        status: {
          success:  '#27a644',
          complete: '#10b981',
          warning:  '#f59e0b',
          error:    '#e53935',
        },
      },
      fontFamily: {
        display: ['"Inter Variable"', '"SF Pro Display"', 'system-ui', 'sans-serif'],
        body:    ['"Inter Variable"', '"SF Pro Display"', 'system-ui', 'sans-serif'],
        mono:    ['"Berkeley Mono"', '"SF Mono"', 'Consolas', 'Monaco', 'monospace'],
      },
      fontSize: {
        'display-xl': ['72px', { lineHeight: '1.0',  letterSpacing: '-1.584px', fontWeight: '590' }],
        'display-lg': ['64px', { lineHeight: '1.0',  letterSpacing: '-1.408px', fontWeight: '590' }],
        'display-md': ['48px', { lineHeight: '1.0',  letterSpacing: '-1.056px', fontWeight: '510' }],
        'heading-lg': ['32px', { lineHeight: '1.1',  letterSpacing: '-0.704px', fontWeight: '510' }],
        'heading-md': ['24px', { lineHeight: '1.2',  letterSpacing: '-0.48px',  fontWeight: '510' }],
        'heading-sm': ['20px', { lineHeight: '1.3',  letterSpacing: '-0.24px',  fontWeight: '510' }],
        'body-emphasis':['16px',{ lineHeight: '1.5',  letterSpacing: '-0.165px', fontWeight: '510' }],
        'link-nav':   ['14px', { lineHeight: '2.67', letterSpacing: 'normal',   fontWeight: '510' }],
      },
      maxWidth: {
        'linear-marketing': '1080px',
        'linear-app':       '1280px',
      },
      borderRadius: {
        'micro':       '2px',
        'comfortable': '6px',
        'card':        '8px',
        'panel':       '12px',
        'large':       '22px',
      },
      boxShadow: {
        'linear-popover': 'rgba(0,0,0,0.15) 0 4px 12px, rgba(0,0,0,0.2) 0 8px 24px, inset 0 0 0 1px rgba(255,255,255,0.08)',
        'linear-modal':   'rgba(0,0,0,0.2) 0 16px 48px, rgba(0,0,0,0.3) 0 32px 72px, inset 0 0 0 1px rgba(255,255,255,0.1)',
        'linear-focus':   '0 0 0 2px rgba(94,106,210,0.4), 0 0 0 4px rgba(94,106,210,0.2)',
        'linear-inset':   'inset 0 0 0 1px rgba(0,0,0,0.4), inset 0 2px 4px rgba(0,0,0,0.3)',
      },
      transitionTimingFunction: {
        'linear-default': 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        'linear-enter':   'cubic-bezier(0.165, 0.84, 0.44, 1)',
      },
    },
  },
}
```

---

## 14. Agent Prompt Guide

### Quick Reference

| Element | Value |
|---------|-------|
| Marketing background | `#08090a` |
| Panel background | `#0f1011` |
| Surface card bg | `rgba(255,255,255,0.05)` |
| Primary text | `#f7f8f8` |
| Secondary text | `#d0d6e0` |
| Tertiary text | `#8a8f98` |
| Primary CTA color | `#5e6ad2` (Indigo) |
| CTA hover | `#828fff` |
| Font (all roles) | `Inter Variable` with `fontFeatureSettings: '"cv01", "ss03"'` |
| Font mono | `Berkeley Mono` |
| UI weight | **510** via `fontVariationSettings: "'wght' 510"` |
| Border micro | `rgba(255,255,255,0.02)` |
| Border subtle | `rgba(255,255,255,0.05)` |
| Border standard | `rgba(255,255,255,0.08)` |
| Default radius | `6px` buttons, `8px` cards, `12px` panels |
| Nav height | `64px` |
| Focus ring | `0 0 0 2px rgba(94,106,210,0.4), 0 0 0 4px rgba(94,106,210,0.2)` |
| Motion | 150ms `cubic-bezier(0.25,0.46,0.45,0.94)` default, 300ms `cubic-bezier(0.165,0.84,0.44,1)` for entrances |

### Example Prompts

- "Create a Linear-style hero section on `#08090a` background with ambient indigo glow `radial-gradient(ellipse at 50% 0%, rgba(94,106,210,0.2) 0%, transparent 60%)`. Headline 'Build momentum' at `clamp(40px,5.5vw,72px)`, Inter Variable weight 590, line-height 1.0, letter-spacing -1.584px, color `#f7f8f8`, `fontFeatureSettings: '"cv01", "ss03"'`. Subtitle 18px/400/`#8a8f98`. Primary CTA: bg `#5e6ad2`, hover `#828fff`, white text, 6px radius, 8px 16px padding, weight 510."

- "Build a Linear-style feature card grid (3 cols desktop, 1 mobile). Cards: `rgba(255,255,255,0.05)` bg, `1px solid rgba(255,255,255,0.05)` border, 8px radius, 24px padding. Hover: bg becomes `rgba(255,255,255,0.07)`, 150ms ease. Icon container: 40px, 8px radius, `rgba(94,106,210,0.12)` bg, `#828fff` icon 20px. Title: 20px/510/`#f7f8f8`/`"cv01","ss03"`/-0.24px tracking. Body: 14px/400/`#8a8f98`."

- "Design a Linear-style sticky nav: bg `rgba(8,9,10,0.85)` with `backdrop-filter: blur(12px) saturate(180%)`, h-16, border-bottom `1px solid rgba(255,255,255,0.08)`, max-width 1080px. Links: 14px/510/`#8a8f98` with `"cv01","ss03"`, hover `#d0d6e0`, 150ms. CTA: bg `#5e6ad2`, hover `#828fff`, text `#f7f8f8`, 6px radius, weight 510."

- "Create a Linear-style modal dialog: overlay `rgba(0,0,0,0.5)`, container bg `#191a1b`, radius 12px, border `1px solid rgba(255,255,255,0.08)`, shadow `rgba(0,0,0,0.2) 0 16px 48px, rgba(0,0,0,0.3) 0 32px 72px, inset 0 0 0 1px rgba(255,255,255,0.1)`, max-width 560px. Enter: opacity 0→1, scale 0.96→1.0, 300ms `cubic-bezier(0.165,0.84,0.44,1)`. All text uses Inter Variable with `"cv01","ss03"`."

- "Build a Linear-style status pill system: In Progress `rgba(39,166,68,0.15)` bg / `#27a644` text. Done `rgba(16,185,129,0.15)` / `#10b981`. Cancelled `rgba(255,255,255,0.05)` / `#8a8f98`. All 9999px radius, 4px 10px padding, 12px/510/`"cv01","ss03"`, min-height 24px."

- "Create a dark-first issue list with Linear styling: rows `transparent` bg, hover `rgba(255,255,255,0.03)`, separator `1px solid rgba(255,255,255,0.05)`. Status pill left (12px/510). Title 14px/510/`#f7f8f8`/`"cv01","ss03"`. Metadata 12px/400/`#62666d`. Priority icon 14px `currentColor`. Focus ring on row: `0 0 0 2px rgba(94,106,210,0.4), 0 0 0 4px rgba(94,106,210,0.2)`."

### Pre-flight Checklist for Generated UI

1. `font-feature-settings: "cv01", "ss03"` is present on EVERY Inter Variable text element — the single most common omission that makes Linear look generic
2. Weight 510 is used for all UI labels, buttons, nav links, captions — check that `font-variation-settings: 'wght' 510` is applied, NOT `font-weight: 500` or `font-weight: 600`
3. Focus ring is the multi-layer indigo composite: `0 0 0 2px rgba(94,106,210,0.4), 0 0 0 4px rgba(94,106,210,0.2)` — single-layer rings are insufficient on dark backgrounds
4. No dark drop-shadows on elevated elements — elevation is expressed through luminance (higher `rgba(255,255,255,...)` background values)
5. Borders use `rgba(255,255,255,...)` with the correct opacity tier: 0.02 micro, 0.05 subtle, 0.08 standard — never hardcoded hex border colors in dark mode
6. Touch targets are minimum 44x44px — especially icon buttons which may have 16px icons but need padded 44px touch area
7. Quaternary text `#62666d` is only used for placeholders and decorative labels — informational text uses tertiary `#8a8f98` minimum
8. Animations respect `prefers-reduced-motion: reduce` — no transitions fire in reduced motion mode
9. Motion durations: hover states 150ms, state changes 200ms, entrances 300ms max — nothing slower unless it is a deliberate page transition
10. No bounce or spring easing — verify all `cubic-bezier` values; the only approved curves are `(0.25,0.46,0.45,0.94)`, `(0.165,0.84,0.44,1)`, `(0.4,0,0.2,1)`, and `(0.4,0,1,1)`
11. Letter-spacing scales with size: -1.584px at 72px → -1.056px at 48px → -0.704px at 32px → -0.165px at 16px → normal at 14px and below
12. Dark theme is primary — light theme is an alternate. Every component must look correct in dark before light adjustments are made
13. Status pills use `9999px` radius — not regular buttons or cards. Buttons use `6px`; cards use `8-12px`
14. Modal enter animation: `opacity 0→1` + `scale(0.96→1.0)` at 300ms `cubic-bezier(0.165,0.84,0.44,1)` — scale origin is `center center`
15. Berkeley Mono code blocks at weight 510 with `"cv01","ss03"` features — matches the system's engineering aesthetic
