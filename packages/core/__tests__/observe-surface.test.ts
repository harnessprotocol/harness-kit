import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import {
  observeSurface,
  observeAllSurfaces,
} from "../src/observe/observe-surface.js";
import type {
  ObserveOptions,
  SurfaceObservation,
} from "../src/observe/observe-surface.js";
import { getSurface, SURFACES } from "../src/surfaces/registry.js";
import { SURFACE_IDS } from "../src/surfaces/types.js";
import { loadFixtureProject } from "./helpers/load-fixture-tree.js";
import { MockFsProvider } from "./helpers/mock-fs.js";

const FIXTURES_DIR = resolve(import.meta.dirname, "..", "fixtures", "observe");
const HOME = "/home/user";
const PROJECT = "/project";

const OPTS: ObserveOptions = { projectRoot: PROJECT, homeRoot: HOME, platform: "darwin" };

/**
 * Seed a MockFsProvider from fixtures/observe/machine/: the home/ subtree
 * lands at $HOME and the project/ subtree at /project — one fs simulating a
 * whole machine.
 */
function machineFs(): MockFsProvider {
  const home = loadFixtureProject(resolve(FIXTURES_DIR, "machine", "home"), HOME, HOME);
  const project = loadFixtureProject(resolve(FIXTURES_DIR, "machine", "project"), PROJECT, HOME);
  return new MockFsProvider(
    { ...home.getAllFiles(), ...project.getAllFiles() },
    PROJECT,
    HOME,
  );
}

/** MockFsProvider whose readFile throws for chosen paths (TCC-style denial). */
class FailingReadFs extends MockFsProvider {
  constructor(
    files: Record<string, string>,
    private readonly failPaths: Set<string>,
  ) {
    super(files, PROJECT, HOME);
  }

  override async readFile(path: string): Promise<string> {
    if (this.failPaths.has(path)) {
      throw new Error(`EPERM: operation not permitted, open '${path}'`);
    }
    return super.readFile(path);
  }
}

/** MockFsProvider that records every exists() probe path. */
class RecordingFs extends MockFsProvider {
  readonly existsCalls: string[] = [];

  constructor(files: Record<string, string>) {
    super(files, PROJECT, HOME);
  }

  override async exists(path: string): Promise<boolean> {
    this.existsCalls.push(path);
    return super.exists(path);
  }
}

describe("observeSurface: scope attribution", () => {
  it("claude-code yields both user-scope and project-scope resources, each correctly attributed", async () => {
    const observation = await observeSurface(machineFs(), getSurface("claude-code"), OPTS);

    expect(observation.surface).toBe("claude-code");
    expect(observation.detected).toBe(true);
    expect(observation.skipped).toEqual([]);

    const user = observation.resources.filter((r) => r.scope === "user");
    const project = observation.resources.filter((r) => r.scope === "project");

    // home: 2 mcp servers + researcher skill + CLAUDE.md
    expect(user.map((r) => `${r.kind}:${r.name}`).sort()).toEqual([
      "instructions:CLAUDE.md",
      "mcp-server:docs",
      "mcp-server:github",
      "skill:researcher",
    ]);
    for (const r of user) {
      expect(r.provenance.file.startsWith(`${HOME}/`)).toBe(true);
      expect(r.surface).toBe("claude-code");
    }

    // project: 1 mcp server + local-skill + CLAUDE.md
    expect(project.map((r) => `${r.kind}:${r.name}`).sort()).toEqual([
      "instructions:CLAUDE.md",
      "mcp-server:project-db",
      "skill:local-skill",
    ]);
    for (const r of project) {
      expect(r.provenance.file.startsWith(`${PROJECT}/`)).toBe(true);
    }

    // value rides through untouched (normalization is Task 9)
    const github = observation.resources.find((r) => r.name === "github")!;
    expect(github.value).toMatchObject({
      transport: "stdio",
      command: "docker",
      env: { GITHUB_PERSONAL_ACCESS_TOKEN: "FAKE-github-token-for-fixture" },
    });
  });

  it("cursor yields the same-named server at both scopes — two resources, no dedup", async () => {
    const observation = await observeSurface(machineFs(), getSurface("cursor"), OPTS);

    const postgres = observation.resources.filter(
      (r) => r.kind === "mcp-server" && r.name === "postgres",
    );
    expect(postgres).toHaveLength(2);
    expect(postgres.map((r) => r.scope).sort()).toEqual(["project", "user"]);
    expect(postgres.map((r) => r.provenance.file).sort()).toEqual([
      `${HOME}/.cursor/mcp.json`,
      `${PROJECT}/.cursor/mcp.json`,
    ]);
  });

  it("pi yields skill resources and zero mcp resources; detected via home .pi probe", async () => {
    const observation = await observeSurface(machineFs(), getSurface("pi"), OPTS);

    expect(observation.detected).toBe(true);
    expect(observation.resources.filter((r) => r.kind === "mcp-server")).toEqual([]);
    const skills = observation.resources.filter((r) => r.kind === "skill");
    expect(skills.map((r) => r.name)).toEqual(["notes"]);
    expect(skills[0].scope).toBe("user");
  });

  it("claude-desktop with no config file: detected false, zero resources, zero skipped", async () => {
    const observation = await observeSurface(machineFs(), getSurface("claude-desktop"), OPTS);

    expect(observation).toEqual<SurfaceObservation>({
      surface: "claude-desktop",
      detected: false,
      resources: [],
      skipped: [],
    });
  });
});

describe("observeSurface: machine-only mode (projectRoot null)", () => {
  it("yields only user-scope resources and never evaluates project probes or stores", async () => {
    const fs = new RecordingFs(machineFs().getAllFiles());
    const opts: ObserveOptions = { projectRoot: null, homeRoot: HOME, platform: "darwin" };

    const observations = await observeAllSurfaces(fs, opts);

    for (const observation of observations) {
      for (const resource of observation.resources) {
        expect(resource.scope).toBe("user");
      }
    }
    // With no project root there is nothing project paths could resolve
    // against — every probed/read path must live under the home root.
    for (const path of fs.existsCalls) {
      expect(path.startsWith(`${HOME}/`)).toBe(true);
    }

    // Surfaces detectable only via project probes are undetected.
    const windsurf = observations.find((o) => o.surface === "windsurf")!;
    expect(windsurf.detected).toBe(false);
  });
});

describe("observeSurface: platform path resolution", () => {
  const config = JSON.stringify({
    mcpServers: { desk: { command: "npx", args: ["-y", "desk-mcp"] } },
  });

  it("claude-desktop on win32 resolves the AppData path", async () => {
    const winPath = `${HOME}/AppData/Roaming/Claude/claude_desktop_config.json`;
    const fs = new MockFsProvider({ [winPath]: config }, PROJECT, HOME);

    const observation = await observeSurface(fs, getSurface("claude-desktop"), {
      projectRoot: PROJECT,
      homeRoot: HOME,
      platform: "win32",
    });

    expect(observation.detected).toBe(true);
    expect(observation.resources).toHaveLength(1);
    expect(observation.resources[0].provenance.file).toBe(winPath);
  });

  it("claude-desktop on darwin resolves the Library path", async () => {
    const macPath = `${HOME}/Library/Application Support/Claude/claude_desktop_config.json`;
    const fs = new MockFsProvider({ [macPath]: config }, PROJECT, HOME);

    const observation = await observeSurface(fs, getSurface("claude-desktop"), OPTS);

    expect(observation.detected).toBe(true);
    expect(observation.resources).toHaveLength(1);
    expect(observation.resources[0].provenance.file).toBe(macPath);
  });

  it("a platform with no override falls back to the default path (linux → Library default)", async () => {
    // claude-desktop declares only darwin/win32 overrides; linux falls back
    // to `path` (the darwin/default value) per the registry contract.
    const macPath = `${HOME}/Library/Application Support/Claude/claude_desktop_config.json`;
    const fs = new MockFsProvider({ [macPath]: config }, PROJECT, HOME);

    const observation = await observeSurface(fs, getSurface("claude-desktop"), {
      projectRoot: PROJECT,
      homeRoot: HOME,
      platform: "linux",
    });

    expect(observation.resources[0]?.provenance.file).toBe(macPath);
  });
});

describe("observeSurface: needsConfirmation stamping", () => {
  it("copilot-vscode user-store resources carry needsConfirmation: true", async () => {
    const userMcpPath = `${HOME}/Library/Application Support/Code/User/mcp.json`;
    const fs = new MockFsProvider(
      {
        [userMcpPath]: JSON.stringify({
          servers: { memory: { command: "npx", args: ["-y", "memory-mcp"] } },
        }),
        [`${PROJECT}/.vscode/mcp.json`]: JSON.stringify({
          servers: { issues: { type: "sse", url: "https://issues.example.com/sse" } },
        }),
      },
      PROJECT,
      HOME,
    );

    const observation = await observeSurface(fs, getSurface("copilot-vscode"), OPTS);

    const memory = observation.resources.find((r) => r.name === "memory")!;
    expect(memory.scope).toBe("user");
    expect(memory.needsConfirmation).toBe(true);

    const issues = observation.resources.find((r) => r.name === "issues")!;
    expect(issues.scope).toBe("project");
    expect(issues.needsConfirmation).toBeUndefined();
  });
});

describe("observeSurface: degradation", () => {
  it("an unreadable store file surfaces in skipped while other stores' resources are still reported", async () => {
    const blocked = `${HOME}/.claude.json`;
    const fs = new FailingReadFs(machineFs().getAllFiles(), new Set([blocked]));

    const observation = await observeSurface(fs, getSurface("claude-code"), OPTS);

    expect(observation.skipped).toHaveLength(1);
    expect(observation.skipped[0].file).toBe(blocked);
    expect(observation.skipped[0].reason).toContain("exists but could not be read");

    // The blocked store yields nothing, but siblings still observe.
    expect(observation.resources.filter((r) => r.provenance.file === blocked)).toEqual([]);
    const names = observation.resources.map((r) => r.name);
    expect(names).toContain("researcher");
    expect(names).toContain("project-db");
  });
});

describe("observeAllSurfaces", () => {
  it("returns all 11 surfaces in registry order", async () => {
    const observations = await observeAllSurfaces(machineFs(), OPTS);

    expect(observations.map((o) => o.surface)).toEqual([...SURFACE_IDS]);
    expect(observations).toHaveLength(SURFACES.length);
  });

  it("isolates per-surface failures: one surface's unreadable store doesn't affect others", async () => {
    const blocked = `${HOME}/.claude.json`;
    const fs = new FailingReadFs(machineFs().getAllFiles(), new Set([blocked]));

    const observations = await observeAllSurfaces(fs, OPTS);

    const claudeCode = observations.find((o) => o.surface === "claude-code")!;
    expect(claudeCode.skipped.map((s) => s.file)).toEqual([blocked]);

    const cursor = observations.find((o) => o.surface === "cursor")!;
    expect(cursor.skipped).toEqual([]);
    expect(cursor.resources.filter((r) => r.name === "postgres")).toHaveLength(2);

    const copilotCli = observations.find((o) => o.surface === "copilot-cli")!;
    expect(copilotCli.resources.map((r) => r.name)).toEqual(["playwright"]);

    const codex = observations.find((o) => o.surface === "codex")!;
    expect(codex.resources.map((r) => `${r.scope}:${r.name}`)).toEqual(["user:context7"]);
  });

  it("pinned: a surface whose fs probes THROW degrades to an empty observation while the other surfaces still report", async () => {
    // FsProvider's contract says exists/isDirectory are non-throwing boolean
    // probes; the try/catch in observeAllSurfaces is the backstop for a
    // provider that breaks it — the broken surface degrades, never the sweep.
    class ThrowingExistsFs extends MockFsProvider {
      override async exists(path: string): Promise<boolean> {
        if (path.includes("/.codex")) {
          throw new Error("EIO: probe exploded");
        }
        return super.exists(path);
      }
    }
    const fs = new ThrowingExistsFs(machineFs().getAllFiles(), PROJECT, HOME);

    const observations = await observeAllSurfaces(fs, OPTS);

    expect(observations.map((o) => o.surface)).toEqual([...SURFACE_IDS]);

    const codex = observations.find((o) => o.surface === "codex")!;
    expect(codex.detected).toBe(false);
    expect(codex.resources).toEqual([]);
    expect(codex.skipped).toHaveLength(1);
    expect(codex.skipped[0].file).toBe("<observation>");
    expect(codex.skipped[0].reason).toContain("codex");
    expect(codex.skipped[0].reason).toContain("EIO: probe exploded");

    // The other 10 surfaces observe normally.
    const claudeCode = observations.find((o) => o.surface === "claude-code")!;
    expect(claudeCode.resources.length).toBeGreaterThan(0);
    const cursor = observations.find((o) => o.surface === "cursor")!;
    expect(cursor.resources.filter((r) => r.name === "postgres")).toHaveLength(2);
    for (const o of observations) {
      if (o.surface === "codex") continue;
      expect(o.skipped).toEqual([]);
    }
  });

  it("resources appear in descriptor-store order, then entry order from readStore", async () => {
    const observation = await observeSurface(machineFs(), getSurface("claude-code"), OPTS);

    // Registry store order for claude-code: user mcp, user permissions,
    // user skills, user instructions, project mcp, project permissions,
    // project skills, project instructions.
    expect(observation.resources.map((r) => `${r.scope}:${r.kind}:${r.name}`)).toEqual([
      "user:mcp-server:github",
      "user:mcp-server:docs",
      "user:skill:researcher",
      "user:instructions:CLAUDE.md",
      "project:mcp-server:project-db",
      "project:skill:local-skill",
      "project:instructions:CLAUDE.md",
    ]);
  });
});
