// ── Desktop app types ────────────────────────────────────────

export interface ComponentCounts {
  skills: number;
  agents: number;
  scripts: number;
}

export interface InstalledPlugin {
  name: string;
  version: string;
  description?: string;
  marketplace?: string;
  source?: string;
  installed_at?: string;
  category?: string;
  tags?: string[];
  component_counts?: ComponentCounts;
}

export interface FileTreeNode {
  name: string;
  path: string;
  kind: "file" | "directory";
  children?: FileTreeNode[];
}

export interface PluginUpdateInfo {
  name: string;
  installed_version: string;
  latest_version: string;
  marketplace: string;
}

export interface KnownMarketplace {
  name: string;
  url: string;
  description?: string;
}

export type HookCommand = {
  type: string;
  command: string;
};

export type HooksConfig = Record<string, HookCommand[]>;
