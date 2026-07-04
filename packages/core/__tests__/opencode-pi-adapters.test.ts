import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { opencodeAdapter } from "../src/adapters/opencode/index.js";
import { piAdapter } from "../src/adapters/pi/index.js";
import { getAdapter, ADAPTERS, adapterIdForTarget } from "../src/adapters/registry.js";
import { agentsMdAdapter } from "../src/adapters/agents-md/index.js";
import type { AdapterContext } from "../src/adapters/adapter.js";
import { parseHarness } from "../src/parser/parse-harness.js";
import { importProject, importProjectValidated } from "../src/import/import-project.js";
import { validateHarness } from "../src/schema/validate.js";
import { MockFsProvider } from "./helpers/mock-fs.js";
import { loadFixtureProject } from "./helpers/load-fixture-tree.js";

const IMPORT_FIXTURES = resolve(import.meta.dirname, "..", "fixtures", "import");
const DRIFT_FIXTURES = resolve(import.meta.dirname, "..", "fixtures", "drift");

function ctxFor(fs: MockFsProvider): AdapterContext {
  return { fs, projectRoot: fs.cwd(), homeRoot: "/home/user" };
}

async function configFor(yaml: string) {
  const { config } = parseHarness(yaml);
  return config;
}

const YAML_ACME = `
version: "1"
metadata:
  name: acme
  description: test harness
instructions:
  operational: "Operational instructions, exactly as compiled."
`;

describe("WP-2.5: registry wiring", () => {
  it("opencode and pi are both registered, standalone from the legacy agents-md TargetPlatform mapping", () => {
    expect(getAdapter("opencode")).toBe(opencodeAdapter);
    expect(getAdapter("pi")).toBe(piAdapter);
    expect(ADAPTERS).toContain(opencodeAdapter);
    expect(ADAPTERS).toContain(piAdapter);
  });

  it("does not change the legacy TargetPlatform 'opencode' -> agents-md mapping (golden compile output untouched)", () => {
    // registry.ts's LEGACY_TARGET_TO_ADAPTER must still route the legacy
    // compile.ts pipeline's "opencode" TargetPlatform through agentsMdAdapter,
    // not the new standalone opencodeAdapter.
    expect(adapterIdForTarget("opencode")).toBe("agents-md");
    expect(agentsMdAdapter.capabilities.export.mcp).toBe("partial"); // unchanged from WP-2.1
  });
});

describe("opencode adapter: exportConfig", () => {
  it("emits AGENTS.md operational instructions via the shared compileInstructions service", async () => {
    const fs = new MockFsProvider();
    const config = await configFor(YAML_ACME);
    const plan = await opencodeAdapter.exportConfig(config, ctxFor(fs));

    const agentsMd = plan.files.find((f) => f.path === "AGENTS.md");
    expect(agentsMd).toBeDefined();
    expect(agentsMd!.content).toContain("Operational instructions, exactly as compiled.");
  });

  it("emits opencode.json with mcp servers in OpenCode's native local/remote shape", async () => {
    const fs = new MockFsProvider();
    const yaml = `
version: "1"
metadata:
  name: acme
  description: test harness
mcp-servers:
  postgres:
    transport: stdio
    command: uvx
    args: ["mcp-server-postgres"]
    env:
      DATABASE_URL: postgres://localhost/acme
  acme-api:
    transport: http
    url: https://api.acme.example.com/mcp
    headers:
      Authorization: Bearer sk-FAKE
`;
    const config = await configFor(yaml);
    const plan = await opencodeAdapter.exportConfig(config, ctxFor(fs));

    const configFile = plan.files.find((f) => f.path === "opencode.json");
    expect(configFile).toBeDefined();
    const parsed = JSON.parse(configFile!.content);

    expect(parsed.mcp.postgres).toEqual({
      type: "local",
      command: ["uvx", "mcp-server-postgres"],
      environment: { DATABASE_URL: "postgres://localhost/acme" },
    });
    expect(parsed.mcp["acme-api"]).toEqual({
      type: "remote",
      url: "https://api.acme.example.com/mcp",
      headers: { Authorization: "Bearer sk-FAKE" },
    });
  });

  it("emits opencode.json permission.bash from permissions.tools, and warns for paths/network (no equivalent)", async () => {
    const fs = new MockFsProvider();
    const yaml = `
version: "1"
metadata:
  name: acme
  description: test harness
permissions:
  tools:
    allow: ["Read", "Bash(git *)"]
    deny: ["Bash(rm -rf *)"]
  paths:
    writable: ["sql/"]
`;
    const config = await configFor(yaml);
    const plan = await opencodeAdapter.exportConfig(config, ctxFor(fs));

    const configFile = plan.files.find((f) => f.path === "opencode.json");
    expect(configFile).toBeDefined();
    const parsed = JSON.parse(configFile!.content);
    expect(parsed.permission.bash).toEqual({
      Read: "allow",
      "Bash(git *)": "allow",
      "Bash(rm -rf *)": "deny",
    });

    expect(plan.warnings.some((w) => w.includes("permissions.paths"))).toBe(true);
  });

  it("merges mcp and permissions into a SINGLE opencode.json FileAction, not two competing writes", async () => {
    const fs = new MockFsProvider();
    const yaml = `
version: "1"
metadata:
  name: acme
  description: test harness
mcp-servers:
  postgres:
    transport: stdio
    command: uvx
permissions:
  tools:
    allow: ["Read"]
`;
    const config = await configFor(yaml);
    const plan = await opencodeAdapter.exportConfig(config, ctxFor(fs));

    const configFiles = plan.files.filter((f) => f.path === "opencode.json");
    expect(configFiles).toHaveLength(1);
    const parsed = JSON.parse(configFiles[0].content);
    expect(parsed.mcp.postgres).toBeDefined();
    expect(parsed.permission.bash.Read).toBe("allow");
  });

  it("is non-destructive: preserves an existing opencode.json's unrelated keys and existing server/glob names", async () => {
    const fs = new MockFsProvider({
      "/project/opencode.json": JSON.stringify({
        $schema: "https://opencode.ai/config.json",
        mcp: { railway: { type: "local", command: ["railway", "mcp"], enabled: true } },
        permission: { bash: { "git *": "ask" } },
        agent: { custom: true },
      }),
    });
    const yaml = `
version: "1"
metadata:
  name: acme
  description: test harness
mcp-servers:
  railway:
    transport: stdio
    command: some-other-command
permissions:
  tools:
    allow: ["git *"]
`;
    const config = await configFor(yaml);
    const plan = await opencodeAdapter.exportConfig(config, ctxFor(fs));
    const configFile = plan.files.find((f) => f.path === "opencode.json")!;
    const parsed = JSON.parse(configFile.content);

    // Existing entries kept, not overwritten.
    expect(parsed.mcp.railway.command).toEqual(["railway", "mcp"]);
    expect(parsed.permission.bash["git *"]).toBe("ask");
    // Unrelated existing key preserved.
    expect(parsed.agent).toEqual({ custom: true });
    // Warned about the collisions rather than silently dropping the harness value.
    expect(plan.warnings.some((w) => w.includes("already defines mcp server 'railway'"))).toBe(true);
  });

  it("writes skills into .opencode/skills", async () => {
    const fs = new MockFsProvider({
      "/project/plugin-src/SKILL.md": "---\nname: my-skill\ndescription: does a thing\n---\n\nBody.\n",
    });
    const yaml = `
version: "1"
metadata:
  name: acme
  description: test harness
plugins:
  - name: my-skill
    source: ./plugin-src
`;
    const config = await configFor(yaml);
    const plan = await opencodeAdapter.exportConfig(config, ctxFor(fs));
    const skillFile = plan.files.find((f) => f.path === ".opencode/skills/my-skill/SKILL.md");
    expect(skillFile).toBeDefined();
    expect(skillFile!.content).toContain("Body.");
  });
});

describe("opencode adapter: importConfig (reverse-import)", () => {
  it("reads AGENTS.md as an opaque operational block and opencode.json's mcp/permission back into structured fragments", async () => {
    const fs = loadFixtureProject(resolve(IMPORT_FIXTURES, "opencode-project"));
    const fragments = await opencodeAdapter.importConfig!(ctxFor(fs));

    const instr = fragments.find((f) => f.domain === "instructions");
    expect(instr).toBeDefined();
    expect(instr!.instructions!.blocks[0].text).toContain("This project uses OpenCode");
    expect(instr!.instructions!.blocks[0].source).toEqual({ adapter: "opencode", file: "AGENTS.md" });

    const mcp = fragments.find((f) => f.domain === "mcp");
    expect(mcp).toBeDefined();
    expect(mcp!.mcpServers!.servers.railway.value).toEqual({
      transport: "stdio",
      command: "railway",
      args: ["mcp"],
    });
    expect(mcp!.mcpServers!.servers["acme-api"].value).toEqual({
      transport: "http",
      url: "https://api.acme.example.com/mcp",
      headers: { Authorization: "Bearer sk-FAKE" },
    });

    const perms = fragments.find((f) => f.domain === "permissions");
    expect(perms).toBeDefined();
    expect(perms!.permissions!.value.value.tools?.allow).toContain("git *");
    expect(perms!.permissions!.value.value.tools?.deny).toContain("rm -rf *");
  });

  it("detect() reports the tool present via opencode.json/.opencode indicators", async () => {
    const fs = loadFixtureProject(resolve(IMPORT_FIXTURES, "opencode-project"));
    const result = await opencodeAdapter.detect(ctxFor(fs));
    expect(result).not.toBeNull();
    expect(result!.indicators).toContain("opencode.json");
  });

  it("round-trips through importProject/synthesize into a schema-valid harness.yaml", async () => {
    const fs = loadFixtureProject(resolve(IMPORT_FIXTURES, "opencode-project"));
    const result = await importProjectValidated({ fs, name: "acme", description: "d" });
    expect(validateHarness(result.harnessConfig).valid).toBe(true);
    expect(result.harnessConfig["mcp-servers"]?.railway).toBeDefined();
    expect(result.harnessConfig.permissions?.tools?.allow).toContain("git *");
  });

  it("AGENTS.md content found by both opencode and agents-md adapters dedupes to ONE contribution (byte-identical block)", async () => {
    const fs = loadFixtureProject(resolve(IMPORT_FIXTURES, "opencode-project"));
    const result = await importProject({ fs, name: "acme", description: "d" });

    const operational = result.harnessConfig.instructions?.operational ?? "";
    // The AGENTS.md text appears in the synthesized output...
    expect(operational).toContain("This project uses OpenCode");
    // ...but not duplicated (would appear twice with two "<!-- source: -->"
    // markers if synthesize()'s byte-identical dedupe didn't collapse the
    // agents-md and opencode adapters' identical contributions).
    const occurrences = operational.split("This project uses OpenCode").length - 1;
    expect(occurrences).toBe(1);
  });
});

describe("opencode adapter: diff() drift detection", () => {
  it("classifies AGENTS.md marker drift the same way agents-md does", async () => {
    const fs = loadFixtureProject(resolve(DRIFT_FIXTURES, "opencode-drift"));
    const config = await configFor(YAML_ACME);
    const report = await opencodeAdapter.diff!(config, ctxFor(fs));
    expect(report.hasDrift).toBe(true);
    expect(report.byClass["modified-inside-markers"].length).toBeGreaterThan(0);
  });
});

describe("pi adapter: exportConfig", () => {
  it("emits .pi/APPEND_SYSTEM.md with the operational instruction block", async () => {
    const fs = new MockFsProvider();
    const config = await configFor(YAML_ACME);
    const plan = await piAdapter.exportConfig(config, ctxFor(fs));

    const appendSystem = plan.files.find((f) => f.path === ".pi/APPEND_SYSTEM.md");
    expect(appendSystem).toBeDefined();
    expect(appendSystem!.content).toContain("Operational instructions, exactly as compiled.");
  });

  it("warns (does not emit) for behavioral/identity instructions and any permissions block", async () => {
    const fs = new MockFsProvider();
    const yaml = `
version: "1"
metadata:
  name: acme
  description: test harness
instructions:
  operational: "op text"
  behavioral: "be text"
permissions:
  tools:
    allow: ["Read"]
`;
    const config = await configFor(yaml);
    const plan = await piAdapter.exportConfig(config, ctxFor(fs));

    expect(plan.warnings.some((w) => w.includes("instructions.behavioral"))).toBe(true);
    expect(plan.warnings.some((w) => w.includes("permissions are not machine-enforceable"))).toBe(true);
    // No permissions file of any kind should be emitted.
    expect(plan.files.some((f) => f.slot === "permissions")).toBe(false);
  });

  it("writes skills into .pi/skills", async () => {
    const fs = new MockFsProvider({
      "/project/plugin-src/SKILL.md": "---\nname: my-skill\ndescription: does a thing\n---\n\nBody.\n",
    });
    const yaml = `
version: "1"
metadata:
  name: acme
  description: test harness
plugins:
  - name: my-skill
    source: ./plugin-src
`;
    const config = await configFor(yaml);
    const plan = await piAdapter.exportConfig(config, ctxFor(fs));
    const skillFile = plan.files.find((f) => f.path === ".pi/skills/my-skill/SKILL.md");
    expect(skillFile).toBeDefined();
    expect(skillFile!.content).toContain("Body.");
  });

  it("declares nearly every domain 'none' by design — a correct reflection of pi's minimalism, not a defect", () => {
    const exportCaps = piAdapter.capabilities.export;
    const noneCaps = Object.entries(exportCaps).filter(([, v]) => v === "none");
    expect(noneCaps.length).toBeGreaterThanOrEqual(5);
    expect(exportCaps.mcp).toBe("none");
    expect(exportCaps.subagents).toBe("none");
    expect(exportCaps.hooks).toBe("none");
  });
});

describe("pi adapter: importConfig (reverse-import)", () => {
  it("reads .pi/APPEND_SYSTEM.md as an opaque operational instruction block", async () => {
    const fs = loadFixtureProject(resolve(IMPORT_FIXTURES, "pi-project"));
    const fragments = await piAdapter.importConfig!(ctxFor(fs));

    const instr = fragments.find((f) => f.domain === "instructions");
    expect(instr).toBeDefined();
    expect(instr!.instructions!.blocks[0].text).toContain("prefer editing existing files");
    expect(instr!.instructions!.blocks[0].source).toEqual({
      adapter: "pi",
      file: ".pi/APPEND_SYSTEM.md",
    });
  });

  it("detect() reports the tool present via the .pi directory indicator", async () => {
    const fs = loadFixtureProject(resolve(IMPORT_FIXTURES, "pi-project"));
    const result = await piAdapter.detect(ctxFor(fs));
    expect(result).not.toBeNull();
    expect(result!.indicators).toContain(".pi");
  });

  it("round-trips through importProject/synthesize into a schema-valid harness.yaml", async () => {
    const fs = loadFixtureProject(resolve(IMPORT_FIXTURES, "pi-project"));
    const result = await importProjectValidated({ fs, name: "acme", description: "d" });
    expect(validateHarness(result.harnessConfig).valid).toBe(true);
    expect(result.harnessConfig.instructions?.operational).toContain("prefer editing existing files");
  });

  it("an empty project reports pi as not detected, nothing found", async () => {
    const fs = new MockFsProvider({}, "/empty", "/home/user");
    const fragments = await piAdapter.importConfig!(ctxFor(fs));
    expect(fragments).toEqual([]);
    const detected = await piAdapter.detect(ctxFor(fs));
    expect(detected).toBeNull();
  });
});

describe("pi adapter: diff() drift detection", () => {
  it("classifies .pi/APPEND_SYSTEM.md marker drift", async () => {
    const fs = loadFixtureProject(resolve(DRIFT_FIXTURES, "pi-drift"));
    const config = await configFor(YAML_ACME);
    const report = await piAdapter.diff!(config, ctxFor(fs));
    expect(report.hasDrift).toBe(true);
    expect(report.byClass["modified-inside-markers"].length).toBeGreaterThan(0);
  });

  it("reports no drift when there is no operational instruction content", async () => {
    const fs = new MockFsProvider();
    const config = await configFor(`
version: "1"
metadata:
  name: acme
  description: test harness
`);
    const report = await piAdapter.diff!(config, ctxFor(fs));
    expect(report.hasDrift).toBe(false);
  });
});

describe("importProject: opencode + pi are surfaced end-to-end (self-verify importMachine/detect gap)", () => {
  it("a project with all five tools' configs present surfaces findings for every adapter, including opencode and pi", async () => {
    const fs = new MockFsProvider({
      "/project/CLAUDE.md": "# Claude\n\nBe careful.\n",
      "/project/AGENTS.md": "# Agents\n\nShared instructions.\n",
      "/project/opencode.json": JSON.stringify({ mcp: { x: { type: "local", command: ["echo", "hi"] } } }),
      "/project/.opencode/skills/.gitkeep": "",
      "/project/.pi/APPEND_SYSTEM.md": "Be terse.\n",
      "/project/.cursor/rules/harness.mdc": "Cursor rule text.\n",
    });

    const result = await importProject({ fs, name: "acme", description: "d" });
    const byId = new Map(result.findings.adapters.map((a) => [a.adapter, a]));

    expect(byId.get("claude-code")!.detected).toBe(true);
    expect(byId.get("cursor")!.detected).toBe(true);
    expect(byId.get("agents-md")!.detected).toBe(true);
    expect(byId.get("opencode")!.detected).toBe(true);
    expect(byId.get("opencode")!.found.some((f) => f.domain === "mcp")).toBe(true);
    expect(byId.get("pi")!.detected).toBe(true);
    expect(byId.get("pi")!.found.some((f) => f.domain === "instructions")).toBe(true);
  });
});
