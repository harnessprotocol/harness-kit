import type { LucideIcon } from "lucide-react";
import { FileCode, GitCompareArrows, Monitor, Settings, SquareTerminal, Store } from "lucide-react";

export type LabsKey = "comparator";
export type LabsFlags = Record<LabsKey, boolean>;

export interface NavChild { label: string; path: string; }
export interface NavEntry {
  id: string;
  label: string;
  path: string;
  icon: LucideIcon;
  /** ⌘<n>. Only top-level, non-labs entries carry one. */
  shortcut?: number;
  children?: NavChild[];
  /** Shown only while the matching labs flag is on. */
  labs?: LabsKey;
}

/**
 * The one navigation declaration (spec AC-4, design D2). The sidebar,
 * ⌘-number shortcuts, the command palette and the default-section setting
 * all derive from this list. Paths are unchanged from the pre-consolidation
 * app on purpose (design D3): only grouping and labels move.
 */
export const NAV: NavEntry[] = [
  { id: "machine", label: "Machine", path: "/machine", icon: Monitor, shortcut: 1 },
  {
    id: "profile", label: "Profile", path: "/harness/file", icon: FileCode, shortcut: 2,
    children: [
      { label: "harness.yaml", path: "/harness/file" },
      { label: "Compile to project", path: "/harness/sync" },
    ],
  },
  {
    id: "claude-code", label: "Claude Code", path: "/harness/claude-md", icon: SquareTerminal, shortcut: 3,
    children: [
      { label: "Instructions", path: "/harness/claude-md" },
      { label: "MCP servers", path: "/harness/mcp" },
      { label: "Plugins", path: "/harness/plugins" },
      { label: "Hooks", path: "/harness/hooks" },
      { label: "Permissions", path: "/harness/permissions" },
      { label: "Usage", path: "/observatory" },
    ],
  },
  { id: "marketplace", label: "Marketplace", path: "/marketplace", icon: Store, shortcut: 4 },
  { id: "comparator", label: "Comparator", path: "/comparator", icon: GitCompareArrows, labs: "comparator" },
];

export const SETTINGS: NavEntry = { id: "settings", label: "Settings", path: "/preferences", icon: Settings };

export function visibleNav(labs: LabsFlags): NavEntry[] {
  return NAV.filter((entry) => entry.labs === undefined || labs[entry.labs]);
}

export function shortcutPaths(entries: NavEntry[]): string[] {
  return entries
    .filter((entry): entry is NavEntry & { shortcut: number } => entry.shortcut !== undefined)
    .sort((a, b) => a.shortcut - b.shortcut)
    .map((entry) => entry.path);
}
