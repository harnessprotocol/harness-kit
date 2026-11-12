import { beforeEach, describe, expect, it, vi } from "vitest";
import { describeHarnessSource, readHarnessSource } from "../harness-source";

const mockReadHarnessFile = vi.fn();
vi.mock("../tauri", () => ({ readHarnessFile: () => mockReadHarnessFile() }));

const mockGrant = vi.fn();
vi.mock("../project-dir", () => ({
  grantProjectDir: (dir: string) => mockGrant(dir),
  projectDirLabel: (dir: string) => dir.split("/").pop() ?? dir,
}));

const files: Record<string, string | Error> = {};
const reads: Array<{ projectDir: string; path: string }> = [];
vi.mock("../sync-fs", () => ({
  SyncFsProvider: vi.fn(function SyncFsProvider(this: Record<string, unknown>, projectDir: string) {
    this.joinPath = (...segs: string[]) => segs.join("/");
    this.exists = async (p: string) => p in files;
    this.readFile = async (p: string) => {
      reads.push({ projectDir, path: p });
      const value = files[p];
      if (value instanceof Error) throw value;
      return value;
    };
  }),
}));

// drift-data pulls Tauri modules in; scopeHarnessPath is the one export used.
vi.mock("@tauri-apps/api/path", () => ({ homeDir: vi.fn(async () => "/home/user") }));
vi.mock("../harness-fs", () => ({ TauriFsProvider: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of Object.keys(files)) delete files[key];
  reads.length = 0;
  mockGrant.mockResolvedValue(true);
});

describe("describeHarnessSource (AC-55)", () => {
  it("is the personal profile with no project", () => {
    expect(describeHarnessSource(null)).toEqual({ kind: "personal", label: "Personal profile", projectDir: null });
  });

  it("is the project's team baseline with a project", () => {
    expect(describeHarnessSource("/work/acme")).toEqual({
      kind: "project",
      label: "Team baseline · acme",
      projectDir: "/work/acme",
    });
  });
});

describe("readHarnessSource (AC-55)", () => {
  it("reads ~/.claude/harness.yaml through the personal reader when no project is chosen", async () => {
    mockReadHarnessFile.mockResolvedValue({ found: true, content: "personal", path: "~/.claude/harness.yaml" });
    await expect(readHarnessSource(null)).resolves.toEqual({
      found: true,
      content: "personal",
      path: "~/.claude/harness.yaml",
    });
    expect(mockGrant).not.toHaveBeenCalled();
  });

  it("reads the project's committed harness.yaml, not the personal one, once access is granted", async () => {
    files["/work/acme/harness.yaml"] = "team baseline";
    const result = await readHarnessSource("/work/acme");
    expect(result).toEqual({ found: true, content: "team baseline", path: "/work/acme/harness.yaml" });
    expect(mockGrant).toHaveBeenCalledWith("/work/acme");
    expect(mockReadHarnessFile).not.toHaveBeenCalled();
  });

  it("reports a project without a harness.yaml as not found", async () => {
    await expect(readHarnessSource("/work/acme")).resolves.toEqual({
      found: false,
      content: null,
      path: "/work/acme/harness.yaml",
    });
  });

  it("rejects when the project's file cannot be read, rather than reporting it missing", async () => {
    files["/work/acme/harness.yaml"] = new Error("permission denied");
    await expect(readHarnessSource("/work/acme")).rejects.toThrow("permission denied");
  });

  it("rejects when the app has no access to the project", async () => {
    mockGrant.mockResolvedValue(false);
    await expect(readHarnessSource("/work/acme")).rejects.toThrow(/no access to \/work\/acme/);
    expect(reads).toEqual([]);
  });
});
