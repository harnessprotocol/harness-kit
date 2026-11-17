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
  /** Fill behind white text (primary button): AA, unlike `accent`. */
  accentFill: string;
  /** Status colors as TEXT on their own tint over any surface (AA). */
  successText: string;
  warningText: string;
  dangerText: string;
  /** Modal backdrop behind dialogs and palettes. */
  scrim: string;
  /** Brand mark (app logo) tile and glyph; the same in both themes. */
  brandMarkBg: string;
  brandMarkFg: string;
  /** Categorical data-series colours (charts, timelines), distinct hues. */
  chart1: string;
  chart2: string;
  chart3: string;
  chart4: string;
  chart5: string;
  chart6: string;
  chart7: string;
  chart8: string;
  /** File-type icon colours in the plugin explorer. */
  fileFolder: string;
  fileMd: string;
  filePy: string;
  fileSh: string;
  fileJson: string;
  fileYaml: string;
  fileHtml: string;
  fileTs: string;
  fileJs: string;
  fileCss: string;
  fileToml: string;
  fileTxt: string;
  fileDefault: string;
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
    fgSubtle: "#655F55",      // 5.7:1 on bg-base, 6.3 surface, 5.3 elevated (was 3.3)
    fgPlaceholder: "#716A60", // 4.8:1 on bg-base, 5.3 surface (was 2.5)
    borderBase: "rgba(20, 15, 10, 0.06)",
    borderStrong: "rgba(20, 15, 10, 0.10)",
    borderSubtle: "rgba(20, 15, 10, 0.03)",
    separator: "rgba(20, 15, 10, 0.06)",
    accent: "#2E9BE6",        // azure — icons / large accents / fills
    accentLight: "rgba(46, 155, 230, 0.10)",
    accentFg: "#1668A6",      // azure TEXT on light must use this (AA on white)
    accentText: "#1668A6",    // #2E9BE6 fails small-text contrast on light
    accentGlow: "rgba(46, 155, 230, 0.25)",
    accentFill: "#1D6FB0",    // white text on it: 5.3:1 (#2E9BE6 gave 3.0:1)
    successText: "#1B6F47",
    warningText: "#7A5000",
    dangerText: "#B3262C",
    scrim: "rgba(20, 15, 10, 0.45)",
    brandMarkBg: "#131215",
    brandMarkFg: "#6BC0F5",
    chart1: "#2E9BE6",
    chart2: "#0891B2",
    chart3: "#D97706",
    chart4: "#DC2626",
    chart5: "#16A34A",
    chart6: "#BE185D",
    chart7: "#7C3AED",
    chart8: "#EA580C",
    fileFolder: "#B45309",
    fileMd: "#3B82F6",
    filePy: "#16A34A",
    fileSh: "#9333EA",
    fileJson: "#EA580C",
    fileYaml: "#DB2777",
    fileHtml: "#DC2626",
    fileTs: "#2563EB",
    fileJs: "#CA8A04",
    fileCss: "#0891B2",
    fileToml: "#EA580C",
    fileTxt: "#6B7280",
    fileDefault: "#6B7280",
  },
  dark: {
    bgBase: "#131215",       // warm graphite — NOT slate
    bgSurface: "#1B191E",
    bgElevated: "#242128",
    bgSidebar: "rgba(27, 25, 30, 0.85)",
    bgSidebarSolid: "#1B191E",
    fgBase: "#EDEAE6",        // warm off-white
    fgMuted: "#A29C95",
    fgSubtle: "#968F88",      // 5.9:1 on bg-base, 5.5 surface, 5.0 elevated (was 3.3)
    fgPlaceholder: "#8A847D", // 5.1:1 on bg-base, 4.7 surface (was 2.1)
    borderBase: "rgba(255, 255, 255, 0.05)",
    borderStrong: "rgba(255, 255, 255, 0.09)",
    borderSubtle: "rgba(255, 255, 255, 0.03)",
    separator: "rgba(255, 255, 255, 0.05)",
    accent: "#2E9BE6",        // azure — active nav, primary btn, links, focus
    accentLight: "rgba(46, 155, 230, 0.14)",
    accentFg: "#6BC0F5",      // azure text on dark, AA on --bg-base
    accentText: "#6BC0F5",
    accentGlow: "rgba(46, 155, 230, 0.35)",
    accentFill: "#1D6FB0",
    successText: "#4CC08A",
    warningText: "#E0A33D",
    dangerText: "#FF7A7E",
    scrim: "rgba(0, 0, 0, 0.6)",
    brandMarkBg: "#131215",
    brandMarkFg: "#6BC0F5",
    chart1: "#2E9BE6",
    chart2: "#22D3EE",
    chart3: "#F59E0B",
    chart4: "#F87171",
    chart5: "#4ADE80",
    chart6: "#D08A4A",
    chart7: "#A78BFA",
    chart8: "#FB923C",
    fileFolder: "#D97706",
    fileMd: "#3B82F6",
    filePy: "#22C55E",
    fileSh: "#A855F7",
    fileJson: "#F97316",
    fileYaml: "#EC4899",
    fileHtml: "#EF4444",
    fileTs: "#2563EB",
    fileJs: "#EAB308",
    fileCss: "#06B6D4",
    fileToml: "#F97316",
    fileTxt: "#6B7280",
    fileDefault: "#9CA3AF",
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
  ["accentFill", "--accent-fill"],
  ["successText", "--success-text"],
  ["warningText", "--warning-text"],
  ["dangerText", "--danger-text"],
  ["scrim", "--scrim"],
  ["brandMarkBg", "--brand-mark-bg"],
  ["brandMarkFg", "--brand-mark-fg"],
  ["chart1", "--chart-1"],
  ["chart2", "--chart-2"],
  ["chart3", "--chart-3"],
  ["chart4", "--chart-4"],
  ["chart5", "--chart-5"],
  ["chart6", "--chart-6"],
  ["chart7", "--chart-7"],
  ["chart8", "--chart-8"],
  ["fileFolder", "--file-folder"],
  ["fileMd", "--file-md"],
  ["filePy", "--file-py"],
  ["fileSh", "--file-sh"],
  ["fileJson", "--file-json"],
  ["fileYaml", "--file-yaml"],
  ["fileHtml", "--file-html"],
  ["fileTs", "--file-ts"],
  ["fileJs", "--file-js"],
  ["fileCss", "--file-css"],
  ["fileToml", "--file-toml"],
  ["fileTxt", "--file-txt"],
  ["fileDefault", "--file-default"],
];

/** Render a mode's tokens as indented CSS custom-property declarations. */
export function cssVarBlock(mode: ModeTokens, indent = "  "): string {
  return CSS_VARS.map(([key, name]) => `${indent}${name}: ${mode[key]};`).join("\n");
}
