/**
 * Canonical Harness Kit design tokens — the single source of truth for the
 * shared color identity. Both the desktop app (apps/desktop/src/app.css) and
 * the website (website/app/global.css) consume these via generated CSS variable
 * blocks. Run `pnpm --filter @harness-kit/design-tokens generate` after editing.
 *
 * Identity: Direction A "Instrument" (see apps/desktop/DESIGN.md — canonical
 * v2 spec, signed off 2026-07-03). Warm graphite base (`#131215`, NOT cool
 * slate) with a single azure accent (`#2E9BE6`). Elevation via
 * `--bg-base` -> `--bg-surface` -> `--bg-elevated` + soft warm-tinted shadows,
 * never dark drop-shadows. Borders are near-invisible white/black alpha
 * overlays used only as hairline reinforcement — borderless is the default.
 * Status colors (success/warning/danger) are shared across themes and are
 * intentionally NOT part of this accent block; they stay visually distinct
 * from the brand accent.
 */

export interface ModeTokens {
  bgBase: string;
  bgSurface: string;
  bgElevated: string;
  bgSidebar: string;
  bgSidebarSolid: string;
  fgBase: string;
  fgMuted: string;
  fgSubtle: string;
  fgPlaceholder: string;
  borderBase: string;
  borderStrong: string;
  borderSubtle: string;
  separator: string;
  accent: string;
  accentLight: string;
  accentFg: string;
  accentText: string;
  accentGlow: string;
}

export interface Palette {
  light: ModeTokens;
  dark: ModeTokens;
}

export const palette: Palette = {
  light: {
    bgBase: "#F4F2EF",       // warm paper-neutral — NOT pure #fff, NOT cool grey
    bgSurface: "#FFFFFF",
    bgElevated: "#ECEAE5",
    bgSidebar: "rgba(244, 242, 239, 0.85)",
    bgSidebarSolid: "#FFFFFF",
    fgBase: "#1A1714",
    fgMuted: "#57514A",
    fgSubtle: "#8B8479",
    fgPlaceholder: "#A8A199",
    borderBase: "rgba(20, 15, 10, 0.06)",
    borderStrong: "rgba(20, 15, 10, 0.10)",
    borderSubtle: "rgba(20, 15, 10, 0.03)",
    separator: "rgba(20, 15, 10, 0.06)",
    accent: "#2E9BE6",        // azure — icons / large accents / fills
    accentLight: "rgba(46, 155, 230, 0.10)",
    accentFg: "#1668A6",      // azure TEXT on light must use this (AA on white)
    accentText: "#1668A6",    // #2E9BE6 fails small-text contrast on light
    accentGlow: "rgba(46, 155, 230, 0.25)",
  },
  dark: {
    bgBase: "#131215",       // warm graphite — NOT slate
    bgSurface: "#1B191E",
    bgElevated: "#242128",
    bgSidebar: "rgba(27, 25, 30, 0.85)",
    bgSidebarSolid: "#1B191E",
    fgBase: "#EDEAE6",        // warm off-white
    fgMuted: "#A29C95",
    fgSubtle: "#6C665F",
    fgPlaceholder: "#514C46",
    borderBase: "rgba(255, 255, 255, 0.05)",
    borderStrong: "rgba(255, 255, 255, 0.09)",
    borderSubtle: "rgba(255, 255, 255, 0.03)",
    separator: "rgba(255, 255, 255, 0.05)",
    accent: "#2E9BE6",        // azure — active nav, primary btn, links, focus
    accentLight: "rgba(46, 155, 230, 0.14)",
    accentFg: "#6BC0F5",      // azure text on dark, AA on --bg-base
    accentText: "#6BC0F5",
    accentGlow: "rgba(46, 155, 230, 0.35)",
  },
};

/** Ordered map of token key → CSS custom property name. */
export const CSS_VARS: ReadonlyArray<readonly [keyof ModeTokens, string]> = [
  ["bgBase", "--bg-base"],
  ["bgSurface", "--bg-surface"],
  ["bgElevated", "--bg-elevated"],
  ["bgSidebar", "--bg-sidebar"],
  ["bgSidebarSolid", "--bg-sidebar-solid"],
  ["fgBase", "--fg-base"],
  ["fgMuted", "--fg-muted"],
  ["fgSubtle", "--fg-subtle"],
  ["fgPlaceholder", "--fg-placeholder"],
  ["borderBase", "--border-base"],
  ["borderStrong", "--border-strong"],
  ["borderSubtle", "--border-subtle"],
  ["separator", "--separator"],
  ["accent", "--accent"],
  ["accentLight", "--accent-light"],
  ["accentFg", "--accent-fg"],
  ["accentText", "--accent-text"],
  ["accentGlow", "--accent-glow"],
];

/** Render a mode's tokens as indented CSS custom-property declarations. */
export function cssVarBlock(mode: ModeTokens, indent = "  "): string {
  return CSS_VARS.map(([key, name]) => `${indent}${name}: ${mode[key]};`).join("\n");
}
