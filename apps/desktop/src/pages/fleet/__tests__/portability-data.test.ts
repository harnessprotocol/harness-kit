import { beforeEach, describe, expect, it, vi } from "vitest";

const files = new Map<string, string>();

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

describe("buildDesktopPortabilitySnapshot personal profile path", () => {
  beforeEach(() => files.clear());

  it("reads ~/.harness/harness.yaml", async () => {
    files.set("/home/u/.harness/harness.yaml", profile("new"));
    const snapshot = await buildDesktopPortabilitySnapshot("/home/u");
    expect(snapshot.layers.map((l) => l.source)).toEqual(["/home/u/.harness/harness.yaml"]);
  });

  it("falls back to ~/.claude/harness.yaml when the new file is absent", async () => {
    files.set("/home/u/.claude/harness.yaml", profile("old"));
    const snapshot = await buildDesktopPortabilitySnapshot("/home/u");
    expect(snapshot.layers.map((l) => l.source)).toEqual(["/home/u/.claude/harness.yaml"]);
  });

  it("prefers the new file when both exist", async () => {
    files.set("/home/u/.claude/harness.yaml", profile("old"));
    files.set("/home/u/.harness/harness.yaml", profile("new"));
    const snapshot = await buildDesktopPortabilitySnapshot("/home/u");
    expect(snapshot.layers.map((l) => l.source)).toEqual(["/home/u/.harness/harness.yaml"]);
  });
});
