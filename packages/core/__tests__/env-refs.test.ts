import { describe, expect, it } from "vitest";
import { fromDialect, toDialect } from "../src/compile/env-refs.js";
import { compileMcpServers } from "../src/compile/mcp-servers.js";
import { readMcpConfigFile } from "../src/import/read-mcp.js";
import { normalizeResource } from "../src/observe/normalize.js";
import type { ObservedResource } from "../src/observe/observe-surface.js";
import { planStoreWrite } from "../src/write/write-store.js";
import { isSecretReference, looksLikeSecret } from "../src/portability/secrets.js";
import { SURFACES } from "../src/surfaces/registry.js";
import type { HarnessConfig } from "../src/types.js";
import { MockFsProvider } from "./helpers/mock-fs.js";

const config: HarnessConfig = {
  version: "1",
  metadata: { name: "test", description: "test" },
  "mcp-servers": {
    github: {
      transport: "stdio",
      command: "npx",
      args: ["--token=${GITHUB_TOKEN}", "plain"],
      env: { GITHUB_TOKEN: "${GITHUB_TOKEN}", INPUT: "${input:x}" },
    },
    api: {
      transport: "http",
      url: "https://${HOST}/mcp",
      headers: { Authorization: "Bearer ${API_TOKEN}", Already: "${env:ALREADY}" },
    },
  },
};

describe("toDialect / fromDialect", () => {
  it("rewrites ${NAME} for vscode, leaves everything else alone", () => {
    expect(toDialect("${A}", "vscode")).toBe("${env:A}");
    expect(toDialect("x-${A}-${B_1}", "vscode")).toBe("x-${env:A}-${env:B_1}");
    expect(toDialect("${env:A}", "vscode")).toBe("${env:A}");
    expect(toDialect("${input:a}", "vscode")).toBe("${input:a}");
    expect(toDialect("${workspaceFolder:x}", "vscode")).toBe("${workspaceFolder:x}");
    expect(toDialect("$A", "vscode")).toBe("$A");
    expect(toDialect("${A}", "plain")).toBe("${A}");
  });
  it("leaves VS Code predefined variables alone", () => {
    for (const name of ["workspaceFolder", "userHome", "cwd", "file", "relativeFile", "defaultBuildTask"]) {
      expect(toDialect(`\${${name}}`, "vscode")).toBe(`\${${name}}`);
    }
    expect(toDialect("${workspaceFolder}/x ${TOKEN}", "vscode")).toBe("${workspaceFolder}/x ${env:TOKEN}");
  });
  it("fromDialect rewrites ${env:NAME} to ${NAME}", () => {
    expect(fromDialect("${env:A} and ${env:B}")).toBe("${A} and ${B}");
    expect(fromDialect("${input:a}")).toBe("${input:a}");
    expect(fromDialect("${A}")).toBe("${A}");
  });
});

describe("VS Code predefined variables survive compile and import", () => {
  const withPredefined: HarnessConfig = {
    version: "1",
    metadata: { name: "t", description: "t" },
    "mcp-servers": {
      fs: { transport: "stdio", command: "x", args: ["${workspaceFolder}", "${userHome}/y", "--k=${KEY}"] },
    },
  };

  it("compile to cursor and vscode keeps them and still rewrites real env refs", async () => {
    const { files } = await compileMcpServers(withPredefined, ["cursor", "copilot-vscode"], new MockFsProvider());
    const cursor = JSON.parse(files.find((f) => f.platform === "cursor")!.content).mcpServers;
    const vscode = JSON.parse(files.find((f) => f.platform === "copilot-vscode")!.content).servers;
    for (const s of [cursor, vscode]) {
      expect(s.fs.args).toEqual(["${workspaceFolder}", "${userHome}/y", "--k=${env:KEY}"]);
    }
  });

  it("import reads them back unchanged", async () => {
    const fs = new MockFsProvider({
      "/project/.cursor/mcp.json": JSON.stringify({
        mcpServers: { fs: { command: "x", args: ["${workspaceFolder}", "${userHome}/y", "--k=${env:KEY}"] } },
      }),
    });
    const { imported } = await readMcpConfigFile(fs, ".cursor/mcp.json", "cursor", { envRefDialect: "vscode" });
    expect((imported!.servers.fs!.value as { args: string[] }).args).toEqual([
      "${workspaceFolder}",
      "${userHome}/y",
      "--k=${KEY}",
    ]);
  });

  it("normalize does not equate a predefined variable with an env ref of the same name", () => {
    const res = (arg: string): ObservedResource => ({
      surface: "cursor",
      kind: "mcp-server",
      scope: "project",
      name: "g",
      value: { command: "x", args: [arg] },
      provenance: { file: "/p/.cursor/mcp.json", formatId: "json-mcpservers" },
    });
    expect(normalizeResource(res("${workspaceFolder}")).digest).not.toBe(
      normalizeResource(res("${env:workspaceFolder}")).digest,
    );
  });
});

describe("compile emits per-target env references", () => {
  it("cursor and copilot get ${env:NAME} in env, headers, args and url; claude-code stays verbatim", async () => {
    const { files } = await compileMcpServers(config, ["claude-code", "cursor", "copilot-vscode"], new MockFsProvider());
    const cc = JSON.parse(files.find((f) => f.platform === "claude-code")!.content).mcpServers;
    expect(cc.github.env.GITHUB_TOKEN).toBe("${GITHUB_TOKEN}");
    expect(cc.api.url).toBe("https://${HOST}/mcp");
    expect(cc.api.headers.Already).toBe("${env:ALREADY}");

    const cursor = JSON.parse(files.find((f) => f.platform === "cursor")!.content).mcpServers;
    const vscode = JSON.parse(files.find((f) => f.platform === "copilot-vscode")!.content).servers;
    for (const s of [cursor, vscode]) {
      expect(s.github.env.GITHUB_TOKEN).toBe("${env:GITHUB_TOKEN}");
      expect(s.github.env.INPUT).toBe("${input:x}");
      expect(s.github.args[0]).toBe("--token=${env:GITHUB_TOKEN}");
      expect(s.api.url).toBe("https://${env:HOST}/mcp");
      expect(s.api.headers.Authorization).toBe("Bearer ${env:API_TOKEN}");
      expect(s.api.headers.Already).toBe("${env:ALREADY}");
    }
  });

  it("writes .vscode/mcp.json under servers and preserves an existing servers object", async () => {
    const fs = new MockFsProvider({
      "/project/.vscode/mcp.json": JSON.stringify({
        inputs: [],
        servers: { keep: { type: "stdio", command: "keep-cmd" } },
      }),
    });
    const { files } = await compileMcpServers(config, ["copilot-vscode"], fs);
    const out = JSON.parse(files[0]!.content);
    expect(out.mcpServers).toBeUndefined();
    expect(out.inputs).toEqual([]);
    expect(Object.keys(out.servers).sort()).toEqual(["api", "github", "keep"]);
  });
});

describe("write path matches compile byte for byte", () => {
  it("planStoreWrite for the cursor and vscode stores equals compileMcpServers output", async () => {
    const { files } = await compileMcpServers(
      { ...config, "mcp-servers": { github: config["mcp-servers"]!.github! } },
      ["cursor", "copilot-vscode"],
      new MockFsProvider(),
    );
    for (const [surface, path] of [
      ["cursor", ".cursor/mcp.json"],
      ["copilot-vscode", ".vscode/mcp.json"],
    ] as const) {
      const store = SURFACES.find((s) => s.id === surface)!.stores.find((s) => s.kind === "mcp-server" && s.scope === "project")!;
      const plan = await planStoreWrite(new MockFsProvider(), store, `/project/${path}`, {
        kind: "mcp-server",
        name: "github",
        value: config["mcp-servers"]!.github!,
      });
      expect(plan.supported).toBe(true);
      if (!plan.supported) continue;
      expect(plan.changes[0]!.after).toBe(files.find((f) => f.platform === surface)!.content);
    }
  });
});

describe("import reads the dialect and root key", () => {
  it("a Cursor file imports as ${NAME}", async () => {
    const fs = new MockFsProvider({
      "/project/.cursor/mcp.json": JSON.stringify({
        mcpServers: { g: { command: "x", args: ["${env:A}"], env: { T: "${env:T}" } } },
      }),
    });
    const { imported } = await readMcpConfigFile(fs, ".cursor/mcp.json", "cursor", { envRefDialect: "vscode" });
    const v = imported!.servers.g!.value as { args: string[]; env: Record<string, string> };
    expect(v.args).toEqual(["${A}"]);
    expect(v.env.T).toBe("${T}");
  });
  it("reads servers from .vscode/mcp.json", async () => {
    const fs = new MockFsProvider({
      "/project/.vscode/mcp.json": JSON.stringify({
        servers: { g: { type: "http", url: "https://${env:H}/m" } },
      }),
    });
    const { imported } = await readMcpConfigFile(fs, ".vscode/mcp.json", "copilot", {
      rootKey: "servers",
      envRefDialect: "vscode",
    });
    expect((imported!.servers.g!.value as { url: string }).url).toBe("https://${H}/m");
  });
});

describe("normalize and secret detection", () => {
  const res = (value: unknown): ObservedResource => ({
    surface: "cursor",
    kind: "mcp-server",
    scope: "project",
    name: "g",
    value,
    provenance: { file: "/p/.cursor/mcp.json", formatId: "json-mcpservers" },
  });
  it("treats ${X} and ${env:X} as equal", () => {
    const a = normalizeResource(res({ command: "x", args: ["--a=${X}"], env: { Y: "${Y}" }, url: undefined }));
    const b = normalizeResource(res({ command: "x", args: ["--a=${env:X}"], env: { Y: "${env:Y}" } }));
    expect(a.digest).toBe(b.digest);
  });
  it("looksLikeSecret treats ${env:X} as a reference", () => {
    expect(isSecretReference("${env:API_KEY}")).toBe(true);
    expect(looksLikeSecret("API_KEY", "${env:API_KEY}")).toBe(false);
  });
});

describe("legacy mcpServers in a servers-root file", () => {
  const legacyFile = JSON.stringify({
    servers: { both: { type: "stdio", command: "new" } },
    mcpServers: { both: { type: "stdio", command: "old" }, old: { type: "stdio", command: "old-cmd" } },
  });
  const one: HarnessConfig = {
    version: "1",
    metadata: { name: "t", description: "t" },
    "mcp-servers": { fresh: { transport: "stdio", command: "f" } },
  };

  it("compile migrates into servers, warns, drops mcpServers; servers wins a clash", async () => {
    const fs = new MockFsProvider({ "/project/.vscode/mcp.json": legacyFile });
    const { files, warnings } = await compileMcpServers(one, ["copilot-vscode"], fs);
    const out = JSON.parse(files[0]!.content);
    expect(out.mcpServers).toBeUndefined();
    expect(out.servers.both.command).toBe("new");
    expect(out.servers.old.command).toBe("old-cmd");
    expect(out.servers.fresh.command).toBe("f");
    expect(warnings).toContain(
      'Moved 2 server(s) from "mcpServers" to "servers" in .vscode/mcp.json (VS Code reads only "servers").',
    );
  });

  it("import sees leftover entries, servers wins", async () => {
    const fs = new MockFsProvider({ "/project/.vscode/mcp.json": legacyFile });
    const { imported } = await readMcpConfigFile(fs, ".vscode/mcp.json", "copilot", { rootKey: "servers" });
    expect(Object.keys(imported!.servers).sort()).toEqual(["both", "old"]);
    expect((imported!.servers.both!.value as { command: string }).command).toBe("new");
  });

  it("compile and write-store bytes stay equal on a legacy file", async () => {
    const fs = new MockFsProvider({ "/project/.vscode/mcp.json": legacyFile });
    const { files } = await compileMcpServers(one, ["copilot-vscode"], fs);
    const store = SURFACES.find((s) => s.id === "copilot-vscode")!.stores.find(
      (s) => s.kind === "mcp-server" && s.scope === "project",
    )!;
    const plan = await planStoreWrite(fs, store, "/project/.vscode/mcp.json", {
      kind: "mcp-server",
      name: "fresh",
      value: one["mcp-servers"]!.fresh!,
    });
    expect(plan.supported && plan.changes[0]!.after).toBe(files[0]!.content);
  });
});
