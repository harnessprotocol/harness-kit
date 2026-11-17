import { describe, it, expect } from "vitest";
import { SURFACES, catalogSkillContent } from "@harness-kit/core";
import type { FsProvider, ProcessCommand, ProcessResult, ProcessRunner, SurfaceDescriptor } from "@harness-kit/core";
import type { MarketplacePlugin } from "@harness-kit/marketplace-data";
import {
  applyCatalogInstall,
  planCatalogInstall,
  readKnownMarketplaces,
} from "../install-to";

const surface = (id: string) => SURFACES.find((s) => s.id === id) as SurfaceDescriptor;

const plugin = {
  name: "explain",
  slug: "explain",
  installCommand: "/plugin install explain@harness-kit",
  skills: [{ dir: "explain", name: "explain", description: "Explain code", body: "Body text" }],
} as unknown as MarketplacePlugin;

function fakeRunner(results: ProcessResult[]) {
  const calls: ProcessCommand[] = [];
  const runner: ProcessRunner = {
    async run(cmd) {
      calls.push(cmd);
      return results.shift() ?? { status: "ok", exitCode: 0, stdout: "", stderr: "" };
    },
    async which() {
      return "/usr/bin/claude";
    },
  };
  return { runner, calls };
}

function fakeFs() {
  const files = new Map<string, string>();
  const fs = {
    joinPath: (...p: string[]) => p.join("/").replace(/\/+/g, "/"),
    async exists(path: string) {
      return files.has(path);
    },
    async readFile(path: string) {
      const v = files.get(path);
      if (v === undefined) throw new Error("ENOENT");
      return v;
    },
    async writeFile(path: string, content: string) {
      files.set(path, content);
    },
    async renameFile(from: string, to: string) {
      files.set(to, files.get(from) ?? "");
      files.delete(from);
    },
    async removeFile(path: string) {
      files.delete(path);
    },
    async mkdir() {},
    dirname: (p: string) => p.slice(0, p.lastIndexOf("/")),
  } as unknown as FsProvider;
  return { fs, files };
}

function view(id: string, scope: "user" | "project" = "user") {
  return planCatalogInstall({
    surface: surface(id),
    identity: "explain@harness-kit",
    scope,
    projectRoot: null,
    registry: SURFACES,
    label: id,
  });
}

const ok = (): ProcessResult => ({ status: "ok", exitCode: 0, stdout: "", stderr: "" });
const base = {
  plugin,
  marketplaceName: "harness-kit",
  marketplaceSource: "harnessprotocol/harness-kit",
  home: "/home/test",
  now: "2026-11-16T00:00:00.000Z",
};

describe("planCatalogInstall apply availability", () => {
  it("is available for a supported native plan and a supported unpack plan", () => {
    expect(view("claude-code").applyBlockedReason).toBeNull();
    expect(view("claude-code").cli).toContain("claude plugin install");
    expect(view("pi").applyBlockedReason).toBeNull();
  });

  it("keeps the reason for an unsupported plan", () => {
    expect(view("claude-code", "project").applyBlockedReason).toMatch(/project directory/);
  });
});

describe("applyCatalogInstall", () => {
  it("known marketplace: only the install runs", async () => {
    const { runner, calls } = fakeRunner([ok()]);
    const { fs } = fakeFs();
    const outcome = await applyCatalogInstall({
      ...base,
      view: view("claude-code"),
      surface: surface("claude-code"),
      runner,
      fs,
      readKnownMarketplaces: async () => ["harness-kit"],
    });
    expect(outcome.status).toBe("installed");
    expect(calls.map((c) => [c.command, ...c.args])).toEqual([
      ["claude", "plugin", "install", "explain@harness-kit", "--scope", "user"],
    ]);
  });

  it("unknown marketplace: adds it first with the exact argv, then installs", async () => {
    const { runner, calls } = fakeRunner([ok(), ok()]);
    const { fs } = fakeFs();
    const outcome = await applyCatalogInstall({
      ...base,
      view: view("claude-code"),
      surface: surface("claude-code"),
      runner,
      fs,
      readKnownMarketplaces: async () => [],
    });
    expect(outcome.status).toBe("installed");
    expect(calls[0]).toMatchObject({
      command: "claude",
      args: ["plugin", "marketplace", "add", "harnessprotocol/harness-kit"],
    });
    expect(calls[1]?.args.slice(0, 3)).toEqual(["plugin", "install", "explain@harness-kit"]);
  });

  it("marketplace add exits 1: failed with the last line, install never runs", async () => {
    const { runner, calls } = fakeRunner([
      { status: "ok", exitCode: 1, stdout: "", stderr: "first\nnetwork down\n" },
    ]);
    const { fs } = fakeFs();
    const outcome = await applyCatalogInstall({
      ...base,
      view: view("claude-code"),
      surface: surface("claude-code"),
      runner,
      fs,
      readKnownMarketplaces: async () => [],
    });
    expect(outcome).toEqual({
      status: "failed",
      reason: "Couldn't add the harness-kit marketplace: network down",
    });
    expect(calls).toHaveLength(1);
  });

  it("marketplace add fails to spawn: failed, install never runs", async () => {
    const { runner, calls } = fakeRunner([{ status: "spawn-failed", reason: "nope" }]);
    const { fs } = fakeFs();
    const outcome = await applyCatalogInstall({
      ...base,
      view: view("claude-code"),
      surface: surface("claude-code"),
      runner,
      fs,
      readKnownMarketplaces: async () => [],
    });
    expect(outcome.status).toBe("failed");
    expect(calls).toHaveLength(1);
  });

  it("native install failure passes through", async () => {
    const { runner } = fakeRunner([{ status: "ok", exitCode: 2, stdout: "", stderr: "boom" }]);
    const { fs } = fakeFs();
    const outcome = await applyCatalogInstall({
      ...base,
      view: view("claude-code"),
      surface: surface("claude-code"),
      runner,
      fs,
      readKnownMarketplaces: async () => ["harness-kit"],
    });
    expect(outcome).toMatchObject({ status: "failed", reason: "boom" });
  });

  it("Pi: no process runs, SKILL.md written through the fs", async () => {
    const { runner, calls } = fakeRunner([]);
    const { fs, files } = fakeFs();
    const outcome = await applyCatalogInstall({
      ...base,
      view: view("pi"),
      surface: surface("pi"),
      runner,
      fs,
      readKnownMarketplaces: async () => {
        throw new Error("must not be read");
      },
    });
    expect(calls).toHaveLength(0);
    expect(outcome.status).toBe("installed");
    const written = [...files.entries()].find(([k]) => k.endsWith("/explain/SKILL.md"));
    expect(written?.[1]).toBe(catalogSkillContent(plugin.skills[0]!));
  });

  it("refused outcome passes through", async () => {
    const refusing: ProcessRunner = {
      async run() {
        return ok();
      },
      async which() {
        return null;
      },
    };
    const { fs } = fakeFs();
    const outcome = await applyCatalogInstall({
      ...base,
      view: view("claude-code"),
      surface: surface("claude-code"),
      runner: refusing,
      fs,
      readKnownMarketplaces: async () => ["harness-kit"],
    });
    expect(outcome.status).toBe("refused");
  });
});

describe("readKnownMarketplaces", () => {
  it("returns the keys of known_marketplaces.json", async () => {
    const { fs, files } = fakeFs();
    files.set("/home/test/.claude/plugins/known_marketplaces.json", JSON.stringify({ a: {}, b: {} }));
    expect(await readKnownMarketplaces(fs, "/home/test")).toEqual(["a", "b"]);
  });
  it("missing or unparseable file is []", async () => {
    const { fs, files } = fakeFs();
    expect(await readKnownMarketplaces(fs, "/home/test")).toEqual([]);
    files.set("/home/test/.claude/plugins/known_marketplaces.json", "{nope");
    expect(await readKnownMarketplaces(fs, "/home/test")).toEqual([]);
  });
});
