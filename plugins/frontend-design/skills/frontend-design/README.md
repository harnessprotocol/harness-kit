# frontend-design

A Claude Code skill for building production-grade frontend interfaces that avoid generic AI aesthetics.

## What It Does

When invoked, the skill guides Claude to:

1. Gather design context (audience, use cases, brand tone) before generating anything
2. Commit to a specific, bold aesthetic direction — not a safe middle ground
3. Apply concrete rules across typography, color, layout, motion, interaction, and UX writing
4. Run an AI Slop Test — an explicit checklist of fingerprints to audit against before shipping

## The AI Slop Test

The skill includes a named checklist of what AI-generated UIs converge on by default:

- Inter / Roboto / Open Sans / Arial fonts
- Purple-to-blue gradients; cyan-on-dark; neon on dark backgrounds
- Gray text on colored backgrounds
- Glassmorphism used decoratively
- Pure #000 or #fff anywhere
- Cards wrapped in cards; identical card grids; everything centered
- Hero metric layout (big number, small label, gradient accent)
- Dark mode defaulted to as an aesthetic decision
- Bounce / elastic easing; `ease` as default easing
- `height` or `margin` animated instead of `transform` / `opacity`

## Key Rules by Domain

### Typography
- Avoid Inter, Roboto, Open Sans, Lato, Montserrat, Arial
- Alternatives: Instrument Sans, Figtree, Plus Jakarta Sans, Fraunces, Newsreader
- Modular scale with ≥3:1 ratio between levels; fluid type via `clamp()`
- Line-height as base unit for all vertical spacing

### Color
- OKLCH instead of HSL — perceptually uniform
- Always tint neutrals toward brand hue (even chroma 0.01 creates cohesion)
- Never pure #000 or #fff; dark mode backgrounds at oklch 12–18%
- 60-30-10 rule: 60% neutral / 30% secondary / 10% accent

### Layout
- 4pt spacing system (4, 8, 12, 16, 24, 32, 48, 64, 96px)
- Squint test: hierarchy should survive blurred eyes
- Container queries for components; viewport queries for page layouts
- Cards are not required — spacing and alignment create grouping naturally

### Motion
- 100 / 300 / 500ms duration tiers
- Specific `cubic-bezier` values for ease-out, ease-in, ease-in-out
- Only animate `transform` and `opacity`; `grid-template-rows` for height
- `prefers-reduced-motion` is not optional

### Interaction
- All 8 states: Default, Hover, Focus, Active, Disabled, Loading, Error, Success
- `:focus-visible` pattern (never `outline: none` without replacement)
- Skeleton screens over spinners; optimistic UI for low-stakes actions
- Undo over confirmation dialogs

### UX Writing
- Specific verb + object button labels (never "OK", "Submit", "Yes/No")
- Error formula: What happened + Why + How to fix
- Empty states as onboarding moments, not dead ends

## Usage

The skill triggers automatically when you ask Claude to build a web component, page, or application. No explicit invocation needed.

```
Build a settings page for my app
Create a landing page hero section
```

Claude will ask for design context (audience, tone) if none is available, then apply the full skill.
