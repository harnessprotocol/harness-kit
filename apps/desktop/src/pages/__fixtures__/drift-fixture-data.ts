import type { FsProvider } from "@harness-kit/core";
import type { DriftScope, ScopedDriftItem } from "../drift/drift-data";

/**
 * Static fixture data for the Drift screenshot harness (see
 * apps/desktop/src/pages/__fixtures__/DriftFixture.tsx). `fs` is a stub —
 * DriftView never calls it; only DriftPage's real Fix modal would, and the
 * fixture harness renders DriftView directly without mounting that modal.
 */
const stubFs: FsProvider = {
  readFile: async () => "",
  writeFile: async () => {},
  exists: async () => false,
  mkdir: async () => {},
  readDir: async () => [],
  isDirectory: async () => false,
  renameFile: async () => {},
  joinPath: (...segs: string[]) => segs.join("/"),
  dirname: (p: string) => p.split("/").slice(0, -1).join("/"),
  homedir: async () => "/Users/dev",
  cwd: () => "/Users/dev/projects/harness-kit",
};

const globalScope: DriftScope = { kind: "global", root: "/Users/dev", label: "Global", fs: stubFs };
const projectScope: DriftScope = {
  kind: "project",
  root: "/Users/dev/projects/harness-kit",
  label: "harness-kit",
  fs: stubFs,
};

export const DRIFT_FIXTURE_ENTRIES: ScopedDriftItem[] = [
  {
    scope: projectScope,
    item: {
      class: "modified-inside-markers",
      path: "CLAUDE.md",
      adapter: "claude-code",
      target: "claude-code",
      harnessName: "harness-kit",
      slot: "operational",
      expectedContent:
        "## Commands\n\n```bash\npnpm install\npnpm test\n```\n\n## Architecture\n\nSee packages/core for the compile pipeline.\n",
      detail: "operational instructions no longer match harness.yaml",
    },
  },
  {
    scope: projectScope,
    item: {
      class: "missing",
      path: ".cursor/rules/harness.mdc",
      adapter: "cursor",
      target: "cursor",
      harnessName: "harness-kit",
      slot: "behavioral",
      expectedContent: "## Tone\n\nDirect and concise. No filler words.\n",
      detail: "expected marker block not found — file may have been deleted",
    },
  },
  {
    scope: projectScope,
    item: {
      class: "user-modified-outside",
      path: "CLAUDE.md",
      adapter: "claude-code",
      target: "claude-code",
      harnessName: "harness-kit",
      slot: "operational",
      detail: "content outside the marker block was hand-edited",
    },
  },
  {
    scope: projectScope,
    item: {
      class: "orphaned",
      path: ".github/copilot-instructions.md",
      adapter: "copilot",
      target: "copilot",
      harnessName: "old-harness-name",
      slot: "operational",
      detail: "marker block references a harness name no longer in harness.yaml",
    },
  },
  {
    scope: globalScope,
    item: {
      class: "modified-inside-markers",
      path: ".claude/settings.json",
      adapter: "claude-code",
      target: "claude-code",
      harnessName: "global",
      slot: "permissions",
      expectedContent: '{\n  "permissions": {\n    "allow": ["Read", "Grep", "Glob"]\n  }\n}\n',
      detail: "permissions no longer match harness.yaml",
    },
  },
];
