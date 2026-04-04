import { useEffect, useState } from "react";
import { listClaudeDir } from "../lib/tauri";
import {
  getConfigFilesDetailLevel,
  type ConfigFilesDetailLevel,
} from "../lib/preferences";

// ── File filtering ────────────────────────────────────────────

const TEXT_EXTENSIONS = new Set([".md", ".json", ".yaml", ".yml", ".sh", ".txt", ".toml", ".mjs"]);
const HIDDEN_PATTERNS: RegExp[] = [
  /^security_warnings_state_/,
  /^statsig-/,
  /^stats-cache\.json$/,
];
const ESSENTIALS = new Set(["CLAUDE.md", "AGENT.md", "SOUL.md", "settings.json", "keybindings.json"]);

export function extOf(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx === -1 ? "" : name.slice(idx);
}

export function filterFiles(files: string[], level: ConfigFilesDetailLevel): string[] {
  if (level === "essentials") return files.filter((f) => ESSENTIALS.has(f));
  if (level === "text-files") return files.filter(
    (f) => TEXT_EXTENSIONS.has(extOf(f)) && !HIDDEN_PATTERNS.some((p) => p.test(f))
  );
  return files;
}

// ── Hook ──────────────────────────────────────────────────────

export interface UseClaudeFileListReturn {
  files: string[];
  allFiles: string[];
  loading: boolean;
  error: string | null;
  detailLevel: ConfigFilesDetailLevel;
}

export function useClaudeFileList(): UseClaudeFileListReturn {
  const detailLevel = getConfigFilesDetailLevel();
  const [allFiles, setAllFiles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    listClaudeDir()
      .then(setAllFiles)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const files = filterFiles(allFiles, detailLevel);

  return { files, allFiles, loading, error, detailLevel };
}
