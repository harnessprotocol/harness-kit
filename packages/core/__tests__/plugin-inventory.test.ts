import { describe, expect, it } from "vitest";
import {
  readClaudeMarketplaces,
  readClaudePlugins,
} from "../src/codecs/json-claude-plugins.js";
import { readCodexMarketplaces, readCodexPlugins, writeCodexMcp } from "../src/codecs/toml-codex.js";
import { observeSurface } from "../src/observe/observe-surface.js";
import type { ObserveOptions } from "../src/observe/observe-surface.js";
import { relativizeHome } from "../src/observe/read-store.js";
import { normalizeResource } from "../src/observe/normalize.js";
import { computeMachineInventory } from "../src/observe/machine-inventory.js";
import { getSurface, SURFACES } from "../src/surfaces/registry.js";
import { isWritableFormat, planStoreWrite } from "../src/write/write-store.js";
import { planCellAction } from "../src/write/plan-cell-action.js";
import { MockFsProvider } from "./helpers/mock-fs.js";

/**
 * Plugin and marketplace enumeration (AC-4).
 *
 * Fixtures mirror the real on-disk shapes of Claude Code's
 * `~/.claude/plugins/*.json` and Codex's `~/.codex/config.toml`, with
 * synthetic home paths — a fixture must never carry a real machine's
 * username.
 */

const HOME = "/home/user";
const PROJECT = "/project";
const OTHER_PROJECT = "/somewhere/else";
const OPTS: ObserveOptions = { projectRoot: PROJECT, homeRoot: HOME, platform: "darwin" };

const INSTALLED_PLUGINS = JSON.stringify({
  version: 1,
  plugins: {
    "board@harness-kit": [
      {
        scope: "user",
        installPath: `${HOME}/.claude/plugins/cache/harness-kit/board/0.2.0`,
        version: "0.2.0",
        installedAt: "2026-03-17T03:13:29.167Z",
        gitCommitSha: "9e622671eaee6e99215b08a457308e0a7b98fb37",
      },
      {
        scope: "local",
        projectPath: PROJECT,
        installPath: `${HOME}/.claude/plugins/cache/harness-kit/board/0.2.0`,
        version: "0.2.0",
      },
      {
        scope: "local",
        projectPath: OTHER_PROJECT,
        installPath: `${HOME}/.claude/plugins/cache/harness-kit/board/0.2.0`,
        version: "0.2.0",
      },
    ],
    "research@harness-kit": [{ scope: "user", version: "1.4.0" }],
  },
});

const KNOWN_MARKETPLACES = JSON.stringify({
  "harness-kit": {
    installLocation: `${HOME}/.claude/plugins/marketplaces/harness-kit`,
    lastUpdated: "2026-08-10T06:02:00.000Z",
    source: { source: "github", repo: "harnessprotocol/harness-kit" },
  },
  bundled: {
    installLocation: `${HOME}/.claude/plugins/marketplaces/bundled`,
    source: { source: "local", path: `${HOME}/.claude/bundled` },
  },
});

const CODEX_CONFIG = `model = "gpt-5"

[marketplaces.harness-kit]
last_updated = "2026-08-22T18:10:48Z"
source_type = "git"
source = "https://github.com/harnessprotocol/harness-kit.git"

[marketplaces.bundled]
source_type = "local"
source = "${HOME}/.codex/.tmp/bundled-marketplaces/bundled"

[mcp_servers.postgres]
command = "psql-mcp"
args = []

[plugins."board@harness-kit"]
enabled = true

[plugins."research@harness-kit"]
enabled = false
`;

// ── Claude Code codec ───────────────────────────────────────────

describe("readClaudePlugins (AC-4)", () => {
  it("splits '<name>@<marketplace>' and carries version and revision", () => {
    const result = readClaudePlugins(INSTALLED_PLUGINS, PROJECT);
    const user = result.entries.find((e) => e.name === "board@harness-kit" && e.scope === "user");
    expect(user?.value).toEqual({
      marketplace: "harness-kit",
      name: "board",
      enabled: true,
      version: "0.2.0",
      revision: "9e622671eaee6e99215b08a457308e0a7b98fb37",
    });
  });

  it("attributes each install to its OWN scope, not the store's", () => {
    // The file lives at user scope but records project-local installs too.
    const { entries } = readClaudePlugins(INSTALLED_PLUGINS, PROJECT);
    const board = entries.filter((e) => e.name === "board@harness-kit");
    expect(board.map((e) => e.scope).sort()).toEqual(["project", "user"]);
  });

  it("drops project installs belonging to a DIFFERENT project", () => {
    const { entries } = readClaudePlugins(INSTALLED_PLUGINS, PROJECT);
    expect(entries.some((e) => e.projectPath === OTHER_PROJECT)).toBe(false);
  });

  it("machine-only (null) drops project installs without a diagnostic", () => {
    const result = readClaudePlugins(INSTALLED_PLUGINS, null);
    expect(result.entries.every((e) => e.scope === "user")).toBe(true);
    expect(result.skipped).toEqual([]);
  });

  it("no project context at all (undefined) REPORTS the unattributed installs", () => {
    // Silence here would read as "this machine has no project plugins",
    // which is a different claim from "nobody told me the project".
    const result = readClaudePlugins(INSTALLED_PLUGINS, undefined);
    expect(result.entries.every((e) => e.scope === "user")).toBe(true);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toContain("2 project-scope plugin install(s)");
    expect(result.skipped[0].reason).toContain("without project context");
  });

  it("degrades on malformed input rather than throwing", () => {
    expect(readClaudePlugins("{not json", PROJECT).skipped[0].reason).toContain("not valid JSON");
    expect(readClaudePlugins("[]", PROJECT).skipped[0].reason).toContain("root is not a JSON object");
    expect(readClaudePlugins('{"plugins":3}', PROJECT).skipped[0].reason).toContain(
      "'plugins' is not a JSON object",
    );
    // A file with no plugins key is "none installed", not a malformed file.
    expect(readClaudePlugins("{}", PROJECT)).toEqual({ entries: [], skipped: [] });
  });

  it("reports rather than guesses at unrecognized identities and scopes", () => {
    const doc = JSON.stringify({
      plugins: {
        "no-marketplace": [{ scope: "user" }],
        "ok@market": [{ scope: "enterprise" }, "not-an-object"],
      },
    });
    const reasons = readClaudePlugins(doc, PROJECT).skipped.map((s) => s.reason);
    expect(reasons).toContain("plugin 'no-marketplace' is not in '<name>@<marketplace>' form");
    expect(reasons).toContain(`plugin 'ok@market' has an install with unrecognized scope "enterprise"`);
    expect(reasons).toContain("plugin 'ok@market' has an install that is not an object");
  });
});

describe("readClaudeMarketplaces (AC-4)", () => {
  it("reads each registered marketplace's source type and location", () => {
    const { entries } = readClaudeMarketplaces(KNOWN_MARKETPLACES);
    expect(entries).toEqual([
      { id: "bundled", sourceType: "local", source: `${HOME}/.claude/bundled` },
      { id: "harness-kit", sourceType: "github", source: "harnessprotocol/harness-kit" },
    ]);
  });

  it("degrades on malformed input", () => {
    expect(readClaudeMarketplaces("nope").skipped[0].reason).toContain("not valid JSON");
  });
});

// ── Codex codec ─────────────────────────────────────────────────

describe("readCodexPlugins / readCodexMarketplaces (AC-4)", () => {
  it("reads [plugins.\"name@marketplace\"] tables and honours `enabled`", () => {
    const { entries } = readCodexPlugins(CODEX_CONFIG);
    expect(entries).toEqual([
      { name: "board@harness-kit", value: { marketplace: "harness-kit", name: "board", enabled: true } },
      {
        name: "research@harness-kit",
        value: { marketplace: "harness-kit", name: "research", enabled: false },
      },
    ]);
  });

  it("treats a table with no `enabled` key as enabled", () => {
    const { entries } = readCodexPlugins('[plugins."x@y"]\n');
    expect(entries[0].value.enabled).toBe(true);
  });

  it("reads [marketplaces.ID] tables", () => {
    const { entries } = readCodexMarketplaces(CODEX_CONFIG);
    expect(entries.map((e) => e.id)).toEqual(["bundled", "harness-kit"]);
    expect(entries[1]).toEqual({
      id: "harness-kit",
      sourceType: "git",
      source: "https://github.com/harnessprotocol/harness-kit.git",
    });
  });

  it("a config with neither section reads as none, not as malformed", () => {
    expect(readCodexPlugins('model = "gpt-5"')).toEqual({ entries: [], skipped: [] });
    expect(readCodexMarketplaces('model = "gpt-5"')).toEqual({ entries: [], skipped: [] });
  });

  it("degrades on unparseable TOML", () => {
    expect(readCodexPlugins("[[[").skipped[0].reason).toContain("not valid TOML");
    expect(readCodexMarketplaces("[[[").skipped[0].reason).toContain("not valid TOML");
  });
});

describe("codex MCP writes leave plugin tables alone", () => {
  it("an mcp-server upsert preserves [plugins.*] and [marketplaces.*] byte-for-byte", () => {
    // The write scope keeps ~/.codex/config.toml writable because the MCP
    // codec edits it. That is only safe because the managed region is
    // [mcp_servers.*] alone — a plugin table sharing the file must survive.
    const written = writeCodexMcp(CODEX_CONFIG, {
      upsert: { name: "redis", value: { transport: "stdio", command: "redis-mcp", args: [] } },
    });
    expect(written).toContain('[plugins."board@harness-kit"]');
    expect(written).toContain('[plugins."research@harness-kit"]');
    expect(written).toContain("[marketplaces.harness-kit]");
    expect(readCodexPlugins(written).entries).toEqual(readCodexPlugins(CODEX_CONFIG).entries);
    expect(readCodexMarketplaces(written).entries).toEqual(
      readCodexMarketplaces(CODEX_CONFIG).entries,
    );
  });
});

// ── home relativization (no username leaks) ─────────────────────

describe("relativizeHome", () => {
  it("replaces a leading home directory with ~", () => {
    expect(relativizeHome(`${HOME}/.codex/.tmp/x`, HOME)).toBe("~/.codex/.tmp/x");
    expect(relativizeHome(HOME, HOME)).toBe("~");
  });

  it("leaves non-home paths and non-path sources untouched", () => {
    expect(relativizeHome("/opt/marketplaces/x", HOME)).toBe("/opt/marketplaces/x");
    expect(relativizeHome("harnessprotocol/harness-kit", HOME)).toBe("harnessprotocol/harness-kit");
    expect(relativizeHome("https://github.com/a/b.git", HOME)).toBe("https://github.com/a/b.git");
  });

  it("does not treat a home-prefixed SIBLING as inside home", () => {
    expect(relativizeHome("/home/user2/.codex", HOME)).toBe("/home/user2/.codex");
  });

  it("is a no-op without a home root", () => {
    expect(relativizeHome("/home/user/x", undefined)).toBe("/home/user/x");
    expect(relativizeHome("/home/user/x", "")).toBe("/home/user/x");
  });
});

// ── observation wiring ──────────────────────────────────────────

function machineFs(): MockFsProvider {
  return new MockFsProvider(
    {
      [`${HOME}/.claude/plugins/installed_plugins.json`]: INSTALLED_PLUGINS,
      [`${HOME}/.claude/plugins/known_marketplaces.json`]: KNOWN_MARKETPLACES,
      [`${HOME}/.codex/config.toml`]: CODEX_CONFIG,
    },
    PROJECT,
    HOME,
  );
}

describe("observeSurface: plugins and marketplaces (AC-4)", () => {
  it("stamps each Claude Code plugin with its own scope, filtered to this project", async () => {
    const obs = await observeSurface(machineFs(), getSurface("claude-code"), OPTS);
    const plugins = obs.resources.filter((r) => r.kind === "plugin");
    expect(plugins.map((p) => `${p.name}:${p.scope}`).sort()).toEqual([
      "board@harness-kit:project",
      "board@harness-kit:user",
      "research@harness-kit:user",
    ]);
  });

  it("home-relativizes a marketplace source so no username rides in the value", async () => {
    // Scoped deliberately to `source`, which is resource CONTENT and travels
    // wherever inventory travels. `provenance.file` is an absolute local path
    // by design across every kind — that is a separate, pre-existing property
    // of the observe layer, not something this asserts about.
    const obs = await observeSurface(machineFs(), getSurface("codex"), OPTS);
    const bundled = obs.marketplaces.find((m) => m.id === "bundled");
    expect(bundled?.source).toBe("~/.codex/.tmp/bundled-marketplaces/bundled");
    expect(obs.marketplaces.map((m) => m.source ?? "").join("|")).not.toContain(HOME);
  });

  it("a surface with no marketplace store observes an empty list, not an error", async () => {
    const obs = await observeSurface(machineFs(), getSurface("cursor"), OPTS);
    expect(obs.marketplaces).toEqual([]);
    expect(getSurface("cursor").marketplaces).toBeUndefined();
  });
});

describe("plugin canonical form", () => {
  function normalize(surface: "claude-code" | "codex", value: unknown) {
    return normalizeResource({
      surface,
      kind: "plugin",
      scope: "user",
      name: "board@harness-kit",
      value,
      provenance: { file: "/x", formatId: "json-claude-plugins" },
    });
  }

  it("digests equal across surfaces that record different amounts of detail", () => {
    // Claude Code records a version and a commit; Codex records neither.
    // Digesting those would make every cross-surface plugin row a permanent
    // false diff.
    const claude = normalize("claude-code", {
      marketplace: "harness-kit",
      name: "board",
      enabled: true,
      version: "0.2.0",
      revision: "9e62267",
    });
    const codex = normalize("codex", { marketplace: "harness-kit", name: "board", enabled: true });
    expect(claude.digest).toBe(codex.digest);
    expect(claude.canonicalForm).toEqual({
      enabled: true,
      marketplace: "harness-kit",
      name: "board",
    });
  });

  it("a disabled install IS a different canonical form", () => {
    const on = normalize("codex", { marketplace: "m", name: "n", enabled: true });
    const off = normalize("codex", { marketplace: "m", name: "n", enabled: false });
    expect(on.digest).not.toBe(off.digest);
  });
});

describe("plugin cells are actionable but not directly writable (AC-12, AC-13)", () => {
  it("names the installer as the mechanism instead of promising a later direct write", async () => {
    const store = getSurface("claude-code").stores.find((s) => s.kind === "plugin");
    expect(store).toBeDefined();
    const plan = await planStoreWrite(machineFs(), store!, `${HOME}/${store!.path}`, {
      kind: "plugin",
      name: "board@harness-kit",
      value: { marketplace: "harness-kit", name: "board", enabled: true },
    });
    expect(plan.supported).toBe(false);
    expect(plan.supported === false ? plan.reason : "").toContain("surface's own installer");
    // AC-13: no dead cells — the caller still has something to offer.
    expect(plan.supported === false ? plan.reason : "").toContain("CLI command or agent prompt");
  });

  it("a PROJECT-scope-only plugin refuses with the installer reason, not 'absent'", async () => {
    // planCellAction reads the source store before it checks writability. If
    // it read without project context, Claude Code's user-scoped install file
    // would hide the project install and the refusal would claim the plugin
    // is absent — a wrong reason for a real resource.
    const onlyProject = JSON.stringify({
      plugins: { "board@harness-kit": [{ scope: "local", projectPath: PROJECT, version: "0.2.0" }] },
    });
    const fs = new MockFsProvider(
      { [`${HOME}/.claude/plugins/installed_plugins.json`]: onlyProject },
      PROJECT,
      HOME,
    );
    const plan = await planCellAction(
      fs,
      {
        from: "claude-code",
        to: "codex",
        kind: "plugin",
        name: "board@harness-kit",
        scope: "project",
      },
      OPTS,
    );
    expect(plan.supported).toBe(false);
    const reason = plan.supported === false ? plan.reason : "";
    expect(reason).toContain("surface's own installer");
    expect(reason).not.toContain("nothing to copy");
  });

  it("no plugin format has a writer, so no apply can reach an install record", () => {
    for (const surface of SURFACES) {
      for (const store of surface.stores) {
        if (store.kind !== "plugin") continue;
        expect(isWritableFormat(store.formatId), `${surface.id} ${store.formatId}`).toBe(false);
      }
    }
  });
});

describe("machine inventory: plugin rows join across surfaces", () => {
  it("the same plugin on claude-code and codex lands on ONE row with no diff", async () => {
    const fs = machineFs();
    const observations = [
      await observeSurface(fs, getSurface("claude-code"), OPTS),
      await observeSurface(fs, getSurface("codex"), OPTS),
    ];
    const inventory = computeMachineInventory(observations);
    const row = inventory.rows.find((r) => r.key === "plugin:board@harness-kit");
    expect(row?.cells["claude-code"]?.status).toBe("present");
    expect(row?.cells.codex?.status).toBe("present");
    expect(inventory.diffs.some((d) => d.row === "plugin:board@harness-kit")).toBe(false);
  });

  it("a plugin enabled on one surface and disabled on the other IS a diff", async () => {
    const fs = machineFs();
    const observations = [
      await observeSurface(fs, getSurface("claude-code"), OPTS),
      await observeSurface(fs, getSurface("codex"), OPTS),
    ];
    const inventory = computeMachineInventory(observations);
    // research@harness-kit: installed on claude-code, `enabled = false` on codex.
    const diff = inventory.diffs.find((d) => d.row === "plugin:research@harness-kit");
    expect(diff?.delta).toEqual([
      { path: "enabled", kind: "changed", left: true, right: false },
    ]);
  });

  it("reports marketplaces per surface and whether they are readable at all", async () => {
    const fs = machineFs();
    const inventory = computeMachineInventory([
      await observeSurface(fs, getSurface("claude-code"), OPTS),
      await observeSurface(fs, getSurface("cursor"), OPTS),
    ]);
    const claude = inventory.surfaces.find((s) => s.id === "claude-code");
    const cursor = inventory.surfaces.find((s) => s.id === "cursor");
    expect(claude?.marketplacesReadable).toBe(true);
    expect(claude?.marketplaces.map((m) => m.id)).toEqual(["bundled", "harness-kit"]);
    // Empty for two different reasons — the flag is what separates them.
    expect(cursor?.marketplacesReadable).toBe(false);
    expect(cursor?.marketplaces).toEqual([]);
  });
});
