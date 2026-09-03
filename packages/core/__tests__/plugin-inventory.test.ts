import { describe, expect, it } from "vitest";
import {
  readClaudeEnabledPlugins,
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

/**
 * A real machine has an `enabledPlugins` entry for everything `claude plugin
 * install` put in the install record, so the baseline fixture carries one.
 * Without it every install reads as DISABLED, which is Claude Code's own
 * behaviour (verified) but not the state most tests here are about.
 */
const CLAUDE_SETTINGS = JSON.stringify({
  enabledPlugins: { "board@harness-kit": true, "research@harness-kit": true },
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
    const result = readClaudePlugins(INSTALLED_PLUGINS, PROJECT, {
      "board@harness-kit": true,
    });
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

  it("tolerates a trailing separator on the project root", () => {
    // The desktop passes a user-TYPED directory through verbatim, so a
    // pasted or tab-completed path with a trailing slash must not silently
    // report zero project plugins.
    for (const root of [PROJECT, `${PROJECT}/`, `${PROJECT}//`]) {
      const { entries } = readClaudePlugins(INSTALLED_PLUGINS, root);
      expect(
        entries.filter((e) => e.scope === "project").map((e) => e.name),
        `project root ${JSON.stringify(root)}`,
      ).toEqual(["board@harness-kit"]);
    }
  });

  it("splits the identity on the LAST @, so a scoped name keeps its marketplace", () => {
    const doc = JSON.stringify({
      plugins: { "@acme/toolkit@harness-kit": [{ scope: "user" }] },
    });
    const { entries } = readClaudePlugins(doc, PROJECT);
    expect(entries).toHaveLength(1);
    expect(entries[0].value).toMatchObject({ name: "@acme/toolkit", marketplace: "harness-kit" });
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

describe("Claude Code enablement lives in settings, not the install record", () => {
  // Every property below was verified against `claude plugin list` with an
  // isolated CLAUDE_CONFIG_DIR, not assumed from the file's shape.
  const settings = (map: Record<string, boolean>) => JSON.stringify({ enabledPlugins: map });

  function pluginFs(files: Record<string, string>): MockFsProvider {
    return new MockFsProvider(
      { [`${HOME}/.claude/plugins/installed_plugins.json`]: INSTALLED_PLUGINS, ...files },
      PROJECT,
      HOME,
    );
  }

  async function enabledByName(fs: MockFsProvider, opts = OPTS) {
    const obs = await observeSurface(fs, getSurface("claude-code"), opts);
    return Object.fromEntries(
      obs.resources
        .filter((r) => r.kind === "plugin")
        .map((r) => [`${r.name}:${r.scope}`, (r.value as { enabled: boolean }).enabled]),
    );
  }

  it("treats an ABSENT key as disabled, not enabled", async () => {
    // Deleting one key reports that plugin disabled in `claude plugin list`;
    // deleting the whole map reports every install disabled. `disable`
    // happens to write `false`, so an enabled-by-default reading passes the
    // happy path and fails on a hand-edited or freshly imported file.
    const listed = await enabledByName(
      pluginFs({ [`${HOME}/.claude/settings.json`]: settings({ "board@harness-kit": true }) }),
    );
    expect(listed["board@harness-kit:user"]).toBe(true);
    expect(listed["research@harness-kit:user"]).toBe(false);

    const noSettings = await enabledByName(pluginFs({}));
    expect(Object.values(noSettings).every((v) => v === false)).toBe(true);

    const emptyMap = await enabledByName(
      pluginFs({ [`${HOME}/.claude/settings.json`]: settings({}) }),
    );
    expect(Object.values(emptyMap).every((v) => v === false)).toBe(true);
  });

  it("honours an explicit false", async () => {
    const listed = await enabledByName(
      pluginFs({
        [`${HOME}/.claude/settings.json`]: settings({
          "board@harness-kit": false,
          "research@harness-kit": true,
        }),
      }),
    );
    expect(listed["board@harness-kit:user"]).toBe(false);
    expect(listed["research@harness-kit:user"]).toBe(true);
  });

  it("lets PROJECT settings disable a USER-scope install", async () => {
    // enabledPlugins is one map, not one per install scope: running Claude
    // Code inside a project whose settings disable a plugin disables it there
    // even though the install itself is user-scope.
    const listed = await enabledByName(
      pluginFs({
        [`${HOME}/.claude/settings.json`]: settings({ "board@harness-kit": true }),
        [`${PROJECT}/.claude/settings.json`]: settings({ "board@harness-kit": false }),
      }),
    );
    expect(listed["board@harness-kit:user"]).toBe(false);
    expect(listed["board@harness-kit:project"]).toBe(false);
  });

  it("lets PROJECT settings re-enable what user settings disabled", async () => {
    const listed = await enabledByName(
      pluginFs({
        [`${HOME}/.claude/settings.json`]: settings({ "board@harness-kit": false }),
        [`${PROJECT}/.claude/settings.json`]: settings({ "board@harness-kit": true }),
      }),
    );
    expect(listed["board@harness-kit:user"]).toBe(true);
  });

  it("layers project settings.local.json over project settings.json", async () => {
    const listed = await enabledByName(
      pluginFs({
        [`${PROJECT}/.claude/settings.json`]: settings({ "board@harness-kit": false }),
        [`${PROJECT}/.claude/settings.local.json`]: settings({ "board@harness-kit": true }),
      }),
    );
    expect(listed["board@harness-kit:user"]).toBe(true);
  });

  it("does NOT consult ~/.claude/settings.local.json", async () => {
    // Claude Code ignores it for enablement: a true there does not override a
    // false in ~/.claude/settings.json.
    const listed = await enabledByName(
      pluginFs({
        [`${HOME}/.claude/settings.json`]: settings({ "board@harness-kit": false }),
        [`${HOME}/.claude/settings.local.json`]: settings({ "board@harness-kit": true }),
      }),
    );
    expect(listed["board@harness-kit:user"]).toBe(false);
  });

  it("a corrupt settings file is a diagnostic, not a silent decision", async () => {
    const fs = pluginFs({ [`${HOME}/.claude/settings.json`]: "{not json" });
    const obs = await observeSurface(fs, getSurface("claude-code"), OPTS);
    const reason = obs.skipped
      .map((entry) => entry.reason)
      .find((text) => text.includes("enable/disable state could not be read"));
    expect(reason).toBeDefined();
    expect(reason).toContain("not valid JSON");
  });

  it("ignores non-boolean entries rather than coercing them", () => {
    const parsed = readClaudeEnabledPlugins(
      JSON.stringify({ enabledPlugins: { a: true, b: "yes", c: 0, d: false } }),
    );
    expect("enabled" in parsed ? parsed.enabled : null).toEqual({ a: true, d: false });
  });

  it("disabled on one surface and enabled on the other IS a diff (changelog claim)", async () => {
    const fs = new MockFsProvider(
      {
        [`${HOME}/.claude/plugins/installed_plugins.json`]: INSTALLED_PLUGINS,
        [`${HOME}/.claude/settings.json`]: settings({ "board@harness-kit": false }),
        [`${HOME}/.codex/config.toml`]: CODEX_CONFIG,
      },
      PROJECT,
      HOME,
    );
    // Machine-only: board also has a project install in the fixture, and
    // project scope wins precedence within a surface.
    const machineOnly = { ...OPTS, projectRoot: null };
    const inventory = computeMachineInventory([
      await observeSurface(fs, getSurface("claude-code"), machineOnly),
      await observeSurface(fs, getSurface("codex"), machineOnly),
    ]);
    const diff = inventory.diffs.find((d) => d.row === "plugin:board@harness-kit");
    expect(diff?.delta).toEqual([
      { path: "enabled", kind: "changed", left: false, right: true },
    ]);
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

  it("reports a non-object entry instead of inventing a phantom marketplace", () => {
    // installed_plugins.json already carries a top-level `version` number; a
    // future schema field here must not become a marketplace in the badge.
    const result = readClaudeMarketplaces(
      JSON.stringify({ version: 1, "harness-kit": { source: { source: "github", repo: "a/b" } } }),
    );
    expect(result.entries.map((e) => e.id)).toEqual(["harness-kit"]);
    expect(result.skipped.map((s) => s.reason)).toEqual([
      "marketplace 'version' is a number, not an object",
    ]);
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

  it("treats a table with no `enabled` key as enabled, but only a real true as enabled", () => {
    expect(readCodexPlugins('[plugins."x@y"]\n').entries[0].value.enabled).toBe(true);
    // Not `!== false`: a non-boolean is not an assertion of enablement, and
    // reading it as enabled would silently disagree with what Codex does.
    expect(readCodexPlugins('[plugins."x@y"]\nenabled = "yes"\n').entries[0].value.enabled).toBe(
      false,
    );
    expect(readCodexPlugins('[plugins."x@y"]\nenabled = false\n').entries[0].value.enabled).toBe(
      false,
    );
  });

  it("splits the identity on the LAST @, matching the Claude Code codec", () => {
    const { entries } = readCodexPlugins('[plugins."@acme/toolkit@harness-kit"]\nenabled = true\n');
    expect(entries[0].value).toEqual({
      marketplace: "harness-kit",
      name: "@acme/toolkit",
      enabled: true,
    });
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

  it("strips a Windows home directory too", () => {
    // platform: "win32" is a supported observation target, and a Windows home
    // path is where the username is most prominent.
    const win = "C:\\Users\\tester";
    expect(relativizeHome(`${win}\\.codex\\.tmp\\bundled`, win)).toBe("~\\.codex\\.tmp\\bundled");
    expect(relativizeHome(win, win)).toBe("~");
    expect(relativizeHome("C:\\Users\\tester2\\.codex", win)).toBe("C:\\Users\\tester2\\.codex");
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
      [`${HOME}/.claude/settings.json`]: CLAUDE_SETTINGS,
      [`${HOME}/.codex/config.toml`]: CODEX_CONFIG,
    },
    PROJECT,
    HOME,
  );
}

describe("marketplace sources cannot carry credentials off the machine", () => {
  // Marketplaces travel BESIDE the resource pipeline, so they never reach the
  // normalizer that sanitizes every other value. A git URL with inline
  // credentials is the shape both surfaces genuinely record for a private
  // marketplace, and `harness-kit status --json` is what users paste into
  // bug reports.
  const TOKEN = "ghp_EXAMPLETOKEN0000000000000000000000";

  async function sourcesFor(files: Record<string, string>, surface: "claude-code" | "codex") {
    const fs = new MockFsProvider(files, PROJECT, HOME);
    const obs = await observeSurface(fs, getSurface(surface), OPTS);
    return obs.marketplaces.map((m) => m.source ?? "");
  }

  it("placeholders userinfo in a Claude Code marketplace URL", async () => {
    const sources = await sourcesFor(
      {
        [`${HOME}/.claude/plugins/known_marketplaces.json`]: JSON.stringify({
          priv: { source: { source: "git", url: `https://john:${TOKEN}@github.com/acme/m.git` } },
        }),
      },
      "claude-code",
    );
    expect(sources).toEqual(["https://<secret>@github.com/acme/m.git"]);
    expect(sources.join()).not.toContain(TOKEN);
  });

  it("placeholders userinfo in a Codex marketplace URL", async () => {
    const sources = await sourcesFor(
      {
        [`${HOME}/.codex/config.toml`]:
          `[marketplaces.priv]\nsource_type = "git"\nsource = "https://x-access-token:${TOKEN}@github.com/acme/m.git"\n`,
      },
      "codex",
    );
    expect(sources).toEqual(["https://<secret>@github.com/acme/m.git"]);
    expect(sources.join()).not.toContain(TOKEN);
  });

  it("placeholders a credential in a query string too", async () => {
    const sources = await sourcesFor(
      {
        [`${HOME}/.codex/config.toml`]:
          `[marketplaces.priv]\nsource = "https://host/repo.git?access_token=${TOKEN}"\n`,
      },
      "codex",
    );
    expect(sources).toEqual(["https://host/repo.git?access_token=<secret>"]);
  });

  it("leaves an ordinary source untouched, and still relativizes home", async () => {
    const sources = await sourcesFor(
      {
        [`${HOME}/.codex/config.toml`]:
          `[marketplaces.a]\nsource = "https://github.com/acme/m.git"\n\n[marketplaces.b]\nsource = "${HOME}/.codex/bundled"\n\n[marketplaces.c]\nsource = "acme/m"\n`,
      },
      "codex",
    );
    expect(sources).toEqual(["https://github.com/acme/m.git", "~/.codex/bundled", "acme/m"]);
  });
});

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

  it("an unreadable marketplace file is NOT 'none registered'", async () => {
    // The empty list is identical either way; `marketplacesReadable` is the
    // only thing separating "we looked and there are none" from "we could not
    // look". Deriving it from the descriptor alone would report a corrupt or
    // permission-denied file as a confident zero.
    const fs = new MockFsProvider(
      {
        [`${HOME}/.claude/plugins/installed_plugins.json`]: INSTALLED_PLUGINS,
        [`${HOME}/.claude/plugins/known_marketplaces.json`]: "{ not json",
      },
      PROJECT,
      HOME,
    );
    const obs = await observeSurface(fs, getSurface("claude-code"), OPTS);
    expect(obs.marketplaces).toEqual([]);
    expect(obs.marketplacesReadable).toBe(false);
    expect(obs.skipped.some((entry) => entry.reason.includes("not valid JSON"))).toBe(true);

    // The same surface with a readable file says so.
    const good = await observeSurface(machineFs(), getSurface("claude-code"), OPTS);
    expect(good.marketplacesReadable).toBe(true);
  });

  it("a surface with no marketplace store observes an empty list, not an error", async () => {
    const obs = await observeSurface(machineFs(), getSurface("cursor"), OPTS);
    expect(obs.marketplaces).toEqual([]);
    expect(obs.marketplacesReadable).toBe(false);
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

  it("does not suppress a gap when the target registered the marketplace under different casing", async () => {
    // Row identity folds case, so `board@Harness-Kit` and `board@harness-kit`
    // join one row. The reachability check must fold too, or a target that
    // HAS the marketplace loses its gap.
    const fs = new MockFsProvider(
      {
        [`${HOME}/.claude/plugins/installed_plugins.json`]: JSON.stringify({
          plugins: { "board@Harness-Kit": [{ scope: "user", version: "1.0.0" }] },
        }),
        [`${HOME}/.claude/settings.json`]: JSON.stringify({
          enabledPlugins: { "board@Harness-Kit": true },
        }),
        [`${HOME}/.codex/config.toml`]: '[marketplaces.harness-kit]\nsource_type = "git"\n',
      },
      PROJECT,
      HOME,
    );
    const inventory = computeMachineInventory([
      await observeSurface(fs, getSurface("claude-code"), OPTS),
      await observeSurface(fs, getSurface("codex"), OPTS),
    ]);
    const gap = inventory.gaps.find((g) => g.row === "plugin:board@harness-kit");
    expect(gap?.missingOn).toEqual(["codex"]);
  });

  it("degrades rather than throwing on an observation missing the new fields", () => {
    // computeMachineInventory is exported and callers build observations by
    // hand; the contract is "degraded, never crashed".
    const partial = {
      surface: "claude-code",
      detected: true,
      resources: [],
      skipped: [],
    } as unknown as Parameters<typeof computeMachineInventory>[0][number];
    const inventory = computeMachineInventory([partial]);
    expect(inventory.surfaces[0].marketplaces).toEqual([]);
    expect(inventory.surfaces[0].marketplacesReadable).toBe(false);
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
