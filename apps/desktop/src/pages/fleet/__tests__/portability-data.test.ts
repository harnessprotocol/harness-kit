import { beforeEach, describe, expect, it, vi } from "vitest";

const files = new Map<string, string>();

const readHarnessFile = vi.hoisted(() => vi.fn());
vi.mock("../../../lib/tauri", () => ({ readHarnessFile }));

vi.mock("../../../lib/harness-fs", () => ({
  TauriFsProvider: vi.fn().mockImplementation(function (this: Record<string, unknown>, cwd: string) {
    this.cwd = () => cwd;
    this.joinPath = (...parts: string[]) => parts.join("/");
    this.exists = async (p: string) => files.has(p) || p.endsWith(".harness/backups");
    this.readFile = async (p: string) => {
      const content = files.get(p);
      if (content === undefined) throw new Error(`ENOENT ${p}`);
      return content;
    };
    this.readDir = async () => [];
    this.isDirectory = async () => false;
  }),
}));

vi.mock("@harness-kit/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@harness-kit/core")>();
  return {
    ...actual,
    importProjectValidated: vi.fn(async () => ({ harnessConfig: {}, findings: {}, provenance: { conflicts: [] } })),
    profileToResources: vi.fn(() => []),
    reconcileResources: vi.fn(() => ({ operations: [], conflicts: [], losses: [] })),
    buildInventorySnapshot: vi.fn(() => ({})),
    resourcesToProfile: vi.fn(() => ({})),
  };
});

import { buildDesktopPortabilitySnapshot } from "../portability-data";

const profile = (name: string) =>
  `version: "2.1"\nkind: profile\nscope: personal\nmetadata:\n  name: ${name}\n  description: ${name}\n`;

/** Rust's answer for the personal profile; the webview fs never holds it. */
function rustReturns(files: Map<string, string>) {
  const fresh = files.get("/home/u/.harness/harness.yaml");
  const legacy = files.get("/home/u/.claude/harness.yaml");
  if (fresh !== undefined) readHarnessFile.mockResolvedValue({ found: true, content: fresh, path: "~/.harness/harness.yaml" });
  else if (legacy !== undefined) {
    readHarnessFile.mockResolvedValue({ found: true, content: legacy, path: "~/.claude/harness.yaml", legacy_claude_file: true });
  } else readHarnessFile.mockResolvedValue({ found: false, content: null, path: null });
}

describe("buildDesktopPortabilitySnapshot personal profile path", () => {
  beforeEach(() => {
    files.clear();
    readHarnessFile.mockReset();
  });

  it("reads ~/.harness/harness.yaml through readHarnessFile, not the fs provider", async () => {
    files.set("/home/u/.harness/harness.yaml", profile("new"));
    rustReturns(files);
    // The webview fs cannot see the file, as in the app.
    files.delete("/home/u/.harness/harness.yaml");
    const snapshot = await buildDesktopPortabilitySnapshot("/home/u");
    expect(readHarnessFile).toHaveBeenCalledTimes(1);
    expect(snapshot.layers.map((l) => l.source)).toEqual(["/home/u/.harness/harness.yaml"]);
  });

  it("falls back to ~/.claude/harness.yaml when Rust reports the legacy file", async () => {
    files.set("/home/u/.claude/harness.yaml", profile("old"));
    rustReturns(files);
    const snapshot = await buildDesktopPortabilitySnapshot("/home/u");
    expect(snapshot.layers.map((l) => l.source)).toEqual(["/home/u/.claude/harness.yaml"]);
  });

  it("prefers the new file when both exist", async () => {
    files.set("/home/u/.claude/harness.yaml", profile("old"));
    files.set("/home/u/.harness/harness.yaml", profile("new"));
    rustReturns(files);
    const snapshot = await buildDesktopPortabilitySnapshot("/home/u");
    expect(snapshot.layers.map((l) => l.source)).toEqual(["/home/u/.harness/harness.yaml"]);
  });

  it("has no personal layer when Rust finds no file", async () => {
    rustReturns(files);
    const snapshot = await buildDesktopPortabilitySnapshot("/home/u");
    expect(snapshot.layers).toEqual([]);
  });
});
