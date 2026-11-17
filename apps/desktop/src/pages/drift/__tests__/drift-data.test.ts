import { describe, it, expect, vi } from "vitest";
import type { DriftItem, FsProvider } from "@harness-kit/core";
import {
  collectDrift,
  describeScopes,
  scopeHarnessPath,
  type DriftScope,
  type ScopedDriftItem,
} from "../drift-data";

const mockDetectDrift = vi.fn();
const mockReadHarnessFile = vi.hoisted(() => vi.fn());
vi.mock("../../../lib/tauri", () => ({ readHarnessFile: () => mockReadHarnessFile() }));
vi.mock("@harness-kit/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@harness-kit/core")>()),
  detectDrift: (...args: unknown[]) => mockDetectDrift(...args),
}));
vi.mock("@tauri-apps/api/path", () => ({ homeDir: vi.fn(async () => "/home/user") }));
vi.mock("../../../lib/harness-fs", () => ({ TauriFsProvider: vi.fn() }));
vi.mock("../../../lib/project-dir", () => ({ grantProjectDir: vi.fn(), projectDirLabel: (d: string) => d }));

const VALID = 'version: "1"\nmetadata:\n  name: t\n  description: d\n';

/**
 * What the Rust `read_harness_file` command returns for a Global scope. The
 * webview fs cannot see ~/.harness/harness.yaml, so Global files are served
 * from here, never from the scope's fs.
 */
function rust(files: Record<string, string | Error>): void {
  const fresh = files["/home/user/.harness/harness.yaml"];
  const legacy = files["/home/user/.claude/harness.yaml"];
  if (fresh instanceof Error || legacy instanceof Error) {
    mockReadHarnessFile.mockRejectedValue(fresh instanceof Error ? fresh : (legacy as Error));
  } else if (typeof fresh === "string") {
    mockReadHarnessFile.mockResolvedValue({ found: true, content: fresh, path: "~/.harness/harness.yaml" });
  } else if (typeof legacy === "string") {
    mockReadHarnessFile.mockResolvedValue({
      found: true, content: legacy, path: "~/.claude/harness.yaml", legacy_claude_file: true,
    });
  } else {
    mockReadHarnessFile.mockResolvedValue({ found: false, content: null, path: null });
  }
}

/** An FsProvider holding `files` (path -> content or an Error to throw on read). */
function fsWith(cwd: string, files: Record<string, string | Error>): FsProvider {
  return {
    cwd: () => cwd,
    joinPath: (...segs: string[]) => segs.join("/"),
    homedir: async () => "/home/user",
    exists: async (p: string) => p in files,
    readFile: async (p: string) => {
      const v = files[p];
      if (v === undefined) throw new Error("not found");
      if (v instanceof Error) throw v;
      return v;
    },
  } as unknown as FsProvider;
}

/** A Global scope whose webview fs is EMPTY (as in the app); `files` is what Rust returns. */
const globalScope = (files: Record<string, string | Error>): DriftScope => {
  rust(files);
  return { kind: "global", root: "/home/user", label: "Global", fs: fsWith("/home/user", {}) };
};
const projectScope = (files: Record<string, string | Error>): DriftScope => ({
  kind: "project",
  root: "/repo",
  label: "repo",
  fs: fsWith("/repo", files),
});

const item = (cls: DriftItem["class"]): DriftItem =>
  ({ class: cls, path: "CLAUDE.md", adapter: "claude-code", harnessName: "t", slot: "operational" }) as DriftItem;
const entry = (scope: DriftScope, cls: DriftItem["class"]): ScopedDriftItem => ({ scope, item: item(cls) });

describe("scopeHarnessPath (AC-55)", () => {
  it("is ~/.harness/harness.yaml for Global and <project>/harness.yaml for a project", () => {
    expect(scopeHarnessPath(globalScope({}))).toBe("/home/user/.harness/harness.yaml");
    expect(scopeHarnessPath(projectScope({}))).toBe("/repo/harness.yaml");
  });
});

describe("collectDrift reads the personal profile and the project baseline (AC-55)", () => {
  it("does not read ~/harness.yaml for Global", async () => {
    mockDetectDrift.mockReset().mockResolvedValue({ items: [], hasDrift: false, byClass: {} });
    const stray = globalScope({ "/home/user/harness.yaml": VALID });
    await collectDrift([stray]);
    expect(mockDetectDrift).not.toHaveBeenCalled();

    const personal = globalScope({ "/home/user/.harness/harness.yaml": VALID });
    await collectDrift([personal]);
    expect(mockDetectDrift).toHaveBeenCalledTimes(1);
  });

  it("falls back to ~/.claude/harness.yaml only when ~/.harness/harness.yaml is absent", async () => {
    mockDetectDrift.mockReset().mockResolvedValue({ items: [], hasDrift: false, byClass: {} });
    const legacyOnly = globalScope({ "/home/user/.claude/harness.yaml": VALID });
    await collectDrift([legacyOnly]);
    expect(mockDetectDrift).toHaveBeenCalledTimes(1);
    const [s] = await describeScopes([legacyOnly], []);
    expect(s.path).toBe("/home/user/.claude/harness.yaml");

    mockDetectDrift.mockClear();
    const both = globalScope({
      "/home/user/.claude/harness.yaml": "version: [",
      "/home/user/.harness/harness.yaml": VALID,
    });
    await collectDrift([both]);
    expect(mockDetectDrift).toHaveBeenCalledTimes(1);
    expect((await describeScopes([both], []))[0].path).toBe("/home/user/.harness/harness.yaml");
  });

  it("reads the project's committed harness.yaml", async () => {
    mockDetectDrift.mockReset().mockResolvedValue({ items: [], hasDrift: false, byClass: {} });
    await collectDrift([projectScope({ "/repo/harness.yaml": VALID })]);
    expect(mockDetectDrift).toHaveBeenCalledTimes(1);
  });
});

describe("describeScopes distinguishes the four states (AC-55)", () => {
  it("no harness.yaml", async () => {
    const [s] = await describeScopes([globalScope({})], []);
    expect(s.state).toBe("no-file");
    expect(s.path).toBe("/home/user/.harness/harness.yaml");
  });

  it("could not read: the file exists but reading throws", async () => {
    const [s] = await describeScopes(
      [globalScope({ "/home/user/.harness/harness.yaml": new Error("EACCES: permission denied") })],
      [],
    );
    expect(s.state).toBe("unreadable");
    expect(s.detail).toContain("EACCES");
  });

  it("could not read: the file exists but is not valid harness.yaml", async () => {
    const [s] = await describeScopes([globalScope({ "/home/user/.harness/harness.yaml": "version: [" })], []);
    expect(s.state).toBe("unreadable");
  });

  it("never compiled: a harness.yaml whose every deployed slot is missing", async () => {
    const scope = globalScope({ "/home/user/.harness/harness.yaml": VALID });
    const [s] = await describeScopes([scope], [entry(scope, "missing"), entry(scope, "missing")]);
    expect(s.state).toBe("never-compiled");
  });

  it("clean: a harness.yaml with no drift", async () => {
    const scope = globalScope({ "/home/user/.harness/harness.yaml": VALID });
    const [s] = await describeScopes([scope], []);
    expect(s.state).toBe("clean");
  });

  it("drifted: some slots missing, others not, is drift and not 'never compiled'", async () => {
    const scope = globalScope({ "/home/user/.harness/harness.yaml": VALID });
    const [s] = await describeScopes([scope], [entry(scope, "missing"), entry(scope, "modified-inside-markers")]);
    expect(s.state).toBe("drifted");
  });

  it("keeps each scope's entries apart", async () => {
    const g = globalScope({ "/home/user/.harness/harness.yaml": VALID });
    const p = projectScope({ "/repo/harness.yaml": VALID });
    const states = await describeScopes([g, p], [entry(p, "missing")]);
    expect(states.map((s) => s.state)).toEqual(["clean", "never-compiled"]);
  });
});

describe("Global reads the personal profile through Rust, not the webview fs", () => {
  it("finds ~/.harness/harness.yaml although the fs scope cannot see it", async () => {
    mockDetectDrift.mockReset().mockResolvedValue({ items: [], hasDrift: false, byClass: {} });
    mockReadHarnessFile.mockClear();
    const scope = globalScope({ "/home/user/.harness/harness.yaml": VALID });
    expect(await scope.fs.exists("/home/user/.harness/harness.yaml")).toBe(false);
    await collectDrift([scope]);
    expect(mockReadHarnessFile).toHaveBeenCalled();
    expect(mockDetectDrift).toHaveBeenCalledTimes(1);
    expect((await describeScopes([scope], []))[0].state).toBe("clean");
  });

  it("compares against the new file, not a stale legacy one, once both exist", async () => {
    mockDetectDrift.mockReset().mockResolvedValue({ items: [], hasDrift: false, byClass: {} });
    const scope = globalScope({
      "/home/user/.harness/harness.yaml": VALID,
      "/home/user/.claude/harness.yaml": "version: [",
    });
    await collectDrift([scope]);
    expect(mockDetectDrift).toHaveBeenCalledTimes(1);
  });

  it("reports a Rust read failure as unreadable, not as no file", async () => {
    const [s] = await describeScopes([globalScope({ "/home/user/.harness/harness.yaml": new Error("denied") })], []);
    expect(s.state).toBe("unreadable");
  });
});
