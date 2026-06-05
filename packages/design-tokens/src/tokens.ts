/**
 * Canonical Harness Kit design tokens — the single source of truth for the
 * shared color identity. Both the desktop app (apps/desktop/src/app.css) and
 * the website (website/app/global.css) consume these via generated CSS variable
 * blocks. Run `pnpm --filter @harness-kit/design-tokens generate` after editing.
 *
 * Identity: "Linear" — Indigo (#5e6ad2) accent on Marketing Black (#08090a),
 * dark-first with a full light mapping. Elevation via luminance stacking
 * (lighter surfaces read as higher); borders are transparent-white overlays.
 * Status colors (success/warning/danger) are intentionally NOT part of this
 * shared block; they are fixed semantic colors managed per-file so the brand
 * accent always stays visually distinct from state.
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
    bgBase: "#f7f8f8",        // Linear marketing (light)
    bgSurface: "#ffffff",     // panel
    bgElevated: "#f0f1f2",    // level3
    bgSidebar: "rgba(247, 248, 248, 0.85)",
    bgSidebarSolid: "#ffffff",
    fgBase: "#08090a",        // text-primary
    fgMuted: "#2c2e33",       // text-secondary
    fgSubtle: "#5a5f6b",      // text-tertiary
    fgPlaceholder: "#8a8f98", // text-quaternary
    borderBase: "rgba(0, 0, 0, 0.06)",   // border-subtle
    borderStrong: "rgba(0, 0, 0, 0.10)", // border-standard
    borderSubtle: "rgba(0, 0, 0, 0.03)", // border-micro
    separator: "rgba(0, 0, 0, 0.06)",
    accent: "#5e6ad2",        // Indigo
    accentLight: "rgba(94, 106, 210, 0.12)",
    accentFg: "#4b57c8",      // accent-hover (light) — readable link/interactive text
    accentText: "#4b57c8",
    accentGlow: "rgba(94, 106, 210, 0.35)",
  },
  dark: {
    bgBase: "#08090a",        // Marketing Black
    bgSurface: "#0f1011",     // panel
    bgElevated: "#191a1b",    // level3
    bgSidebar: "rgba(8, 9, 10, 0.85)",
    bgSidebarSolid: "#0f1011",
    fgBase: "#f7f8f8",        // text-primary
    fgMuted: "#d0d6e0",       // text-secondary
    fgSubtle: "#8a8f98",      // text-tertiary
    fgPlaceholder: "#62666d", // text-quaternary (decorative/disabled only)
    borderBase: "rgba(255, 255, 255, 0.05)",   // border-subtle
    borderStrong: "rgba(255, 255, 255, 0.08)", // border-standard
    borderSubtle: "rgba(255, 255, 255, 0.02)", // border-micro
    separator: "rgba(255, 255, 255, 0.05)",
    accent: "#5e6ad2",        // Indigo
    accentLight: "rgba(94, 106, 210, 0.15)",
    accentFg: "#828fff",      // accent-hover — bright violet, readable on black
    accentText: "#828fff",
    accentGlow: "rgba(94, 106, 210, 0.40)",
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
