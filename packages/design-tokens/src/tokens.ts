/**
 * Canonical Harness Kit design tokens — the single source of truth for the
 * shared color identity. Both the desktop app (apps/desktop/src/app.css) and
 * the website (website/app/global.css) consume these via generated CSS variable
 * blocks. Run `pnpm --filter @harness-kit/design-tokens generate` after editing.
 *
 * Identity: "Iris" — periwinkle accent on a periwinkle-tinted near-black.
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
    bgBase: "#f4f6f9",
    bgSurface: "#f8fafc",
    bgElevated: "#ffffff",
    bgSidebar: "rgba(228, 233, 242, 0.82)",
    bgSidebarSolid: "#e8ecf4",
    fgBase: "#181a20",
    fgMuted: "#5a6070",
    fgSubtle: "#9299a8",
    fgPlaceholder: "#b8bfcc",
    borderBase: "rgba(0, 0, 0, 0.08)",
    borderStrong: "rgba(0, 0, 0, 0.14)",
    borderSubtle: "rgba(0, 0, 0, 0.05)",
    separator: "rgba(0, 0, 0, 0.07)",
    accent: "#5566e6",
    accentLight: "rgba(85, 102, 230, 0.10)",
    accentFg: "#4452cc",
    accentText: "#4452cc",
    accentGlow: "rgba(85, 102, 230, 0.30)",
  },
  dark: {
    bgBase: "#0a0a12",
    bgSurface: "#12131c",
    bgElevated: "#1a1b26",
    bgSidebar: "rgba(10, 10, 18, 0.82)",
    bgSidebarSolid: "#0c0c15",
    fgBase: "#eaeaf2",
    fgMuted: "#9498a8",
    fgSubtle: "#6b6f80",
    fgPlaceholder: "#4b4f60",
    borderBase: "rgba(230, 233, 255, 0.08)",
    borderStrong: "rgba(230, 233, 255, 0.14)",
    borderSubtle: "rgba(230, 233, 255, 0.05)",
    separator: "rgba(230, 233, 255, 0.07)",
    accent: "#7588ff",
    accentLight: "rgba(117, 136, 255, 0.14)",
    accentFg: "#9fa9ff",
    accentText: "#9fa9ff",
    accentGlow: "rgba(117, 136, 255, 0.35)",
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
