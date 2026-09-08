import { describe, expect, it } from "vitest";
import { planPluginAction, executePluginAction } from "../src/plugins/broker.js";
import type { ExecuteOptions } from "../src/plugins/broker.js";
import { planNativePluginAction } from "../src/plugins/installer.js";
import { compareVersions as compareVersionsForTest } from "../src/plugins/unpack.js";
import { getSurface } from "../src/surfaces/registry.js";
import type { ProcessCommand, ProcessResult, ProcessRunner } from "../src/process-runner.js";
import { MockFsProvider } from "./helpers/mock-fs.js";

/**
 * PluginBroker (AC-18, AC-19). Installer verbs and flags in the registry were
 * read from each tool's own `--help`; these tests pin the invocations that
 * result, and the refusals that must happen before anything runs.
 */

const HOME = "/home/user";
const PROJECT = "/project";

/** Records what it was asked to run; never executes anything. */
class FakeRunner implements ProcessRunner {
  readonly calls: ProcessCommand[] = [];
  constructor(
    private readonly result: ProcessResult = { status: "ok", exitCode: 0, stdout: "", stderr: "" },
    private readonly installed: ReadonlySet<string> = new Set(["claude", "codex", "copilot"]),
  ) {}
  async run(command: ProcessCommand): Promise<ProcessResult> {
    this.calls.push(command);
    return this.result;
  }
  async which(command: string): Promise<string | null> {
    return this.installed.has(command) ? `/usr/local/bin/${command}` : null;
  }
}

function options(runner: ProcessRunner, files: Record<string, string> = {}): ExecuteOptions {
  return {
    runner,
    fs: new MockFsProvider(files, PROJECT, HOME),
    now: "2026-09-07T00:00:00.000Z",
    homeRoot: HOME,
  };
}

describe("native driver: the invocation each surface gets", () => {
  it("builds `claude plugin install <identity> --scope user`", () => {
    const plan = planPluginAction({
      surface: "claude-code",
      identity: "board@harness-kit",
      scope: "user",
      action: "install",
    });
    expect(plan.kind).toBe("native");
    if (plan.kind !== "native" || !plan.plan.supported) throw new Error("expected a supported plan");
    expect(plan.plan.command.args).toEqual([
      "plugin",
      "install",
      "board@harness-kit",
      "--scope",
      "user",
    ]);
    expect(plan.plan.display).toBe("claude plugin install board@harness-kit --scope user");
  });

  it("builds `codex plugin add <identity> --json` and runs in no particular directory", () => {
    const plan = planPluginAction({
      surface: "codex",
      identity: "board@harness-kit",
      scope: "user",
      action: "install",
    });
    if (plan.kind !== "native" || !plan.plan.supported) throw new Error("expected a supported plan");
    expect(plan.plan.command.args).toEqual(["plugin", "add", "board@harness-kit", "--json"]);
    expect(plan.plan.structuredOutput).toBe(true);
  });

  it("uninstalls copilot by the FULL identity, keeping the marketplace", () => {
    // `copilot plugin uninstall --help` documents its argument as
    // "plugin-name or plugin-name@marketplace-name" and its own example uses
    // the qualified form. A previous reading of the truncated top-level help
    // recorded a selector asymmetry that does not exist; dropping the
    // marketplace also drops the disambiguator when two marketplaces provide
    // the same plugin name.
    const plan = planPluginAction({
      surface: "copilot-cli",
      identity: "spark@copilot-plugins",
      scope: "user",
      action: "uninstall",
    });
    if (plan.kind !== "native" || !plan.plan.supported) throw new Error("expected a supported plan");
    expect(plan.plan.command.args).toEqual(["plugin", "uninstall", "spark@copilot-plugins"]);
  });

  it("reproduces the source's NATIVE scope rather than collapsing it", () => {
    // A `local` install is private (settings.local.json); a `project` one is
    // committed. Copying the first as the second would share something the
    // user deliberately kept to themselves.
    const local = planPluginAction({
      surface: "claude-code",
      identity: "board@harness-kit",
      scope: "project",
      action: "install",
      projectRoot: PROJECT,
      nativeScope: "local",
    });
    if (local.kind !== "native" || !local.plan.supported) throw new Error("expected a plan");
    expect(local.plan.command.args).toContain("local");

    // An unknown native value is ignored in favour of the mapped one.
    const bogus = planPluginAction({
      surface: "claude-code",
      identity: "board@harness-kit",
      scope: "project",
      action: "install",
      projectRoot: PROJECT,
      nativeScope: "enterprise",
    });
    if (bogus.kind !== "native" || !bogus.plan.supported) throw new Error("expected a plan");
    expect(bogus.plan.command.args).toContain("project");
    expect(bogus.plan.command.args).not.toContain("enterprise");
  });

  it("runs a project-scope claude install inside the project", () => {
    const plan = planPluginAction({
      surface: "claude-code",
      identity: "board@harness-kit",
      scope: "project",
      action: "install",
      projectRoot: PROJECT,
    });
    if (plan.kind !== "native" || !plan.plan.supported) throw new Error("expected a supported plan");
    expect(plan.plan.command.cwd).toBe(PROJECT);
    expect(plan.plan.command.args).toContain("project");
  });
});

describe("native driver: refusals before anything runs", () => {
  it("refuses project scope on an installer with no scope option", () => {
    // Silently landing at user scope would put the plugin somewhere the user
    // did not choose.
    const plan = planPluginAction({
      surface: "codex",
      identity: "board@harness-kit",
      scope: "project",
      action: "install",
      projectRoot: PROJECT,
    });
    if (plan.kind !== "native") throw new Error("expected a native plan");
    expect(plan.plan.supported).toBe(false);
    expect(plan.plan.supported === false ? plan.plan.reason : "").toContain("no scope option");
  });

  it("refuses a project-scope action with no project directory", () => {
    const plan = planPluginAction({
      surface: "claude-code",
      identity: "board@harness-kit",
      scope: "project",
      action: "install",
      projectRoot: null,
    });
    expect(plan.kind).toBe("unsupported");
  });

  it("refuses an identity that would inject a command option", () => {
    // Plugin names come from files other tools write. Under argv `--config`
    // is not a name, it is a flag to the installer.
    const plan = planPluginAction({
      surface: "claude-code",
      identity: "--config=x@m",
      scope: "user",
      action: "install",
    });
    expect(plan.kind).toBe("unsupported");
    expect(plan.kind === "unsupported" ? plan.reason : "").toContain("read as a command option");
  });

  it("refuses a malformed identity rather than guessing a marketplace", () => {
    const plan = planPluginAction({
      surface: "claude-code",
      identity: "no-marketplace",
      scope: "user",
      action: "install",
    });
    if (plan.kind !== "native") throw new Error("expected a native plan");
    expect(plan.plan.supported === false ? plan.plan.reason : "").toContain("<name>@<marketplace>");
  });

  it("refuses a surface with no installer at all", () => {
    const plan = planPluginAction({
      surface: "claude-desktop",
      identity: "board@harness-kit",
      scope: "user",
      action: "install",
    });
    expect(plan.kind).toBe("unsupported");
    expect(plan.kind === "unsupported" ? plan.reason : "").toContain("agent prompt");
  });
});

describe("native driver: execution outcomes", () => {
  const request = {
    surface: "claude-code" as const,
    identity: "board@harness-kit",
    scope: "user" as const,
    action: "install" as const,
  };

  it("reports a missing binary without running anything", async () => {
    const runner = new FakeRunner(undefined, new Set());
    const outcome = await executePluginAction(planPluginAction(request), options(runner));
    expect(outcome.status).toBe("refused");
    expect(outcome.status === "refused" ? outcome.reason : "").toContain("not installed");
    expect(runner.calls).toHaveLength(0);
  });

  it("surfaces the installer's own last line on a non-zero exit", async () => {
    const runner = new FakeRunner({
      status: "ok",
      exitCode: 1,
      stdout: "resolving...\n",
      stderr: "error: marketplace 'harness-kit' is not configured\n",
    });
    const outcome = await executePluginAction(planPluginAction(request), options(runner));
    expect(outcome.status).toBe("failed");
    expect(outcome.status === "failed" ? outcome.reason : "").toBe(
      "error: marketplace 'harness-kit' is not configured",
    );
  });

  it("falls back to stdout when the tool puts its error there", async () => {
    const runner = new FakeRunner({
      status: "ok",
      exitCode: 2,
      stdout: "step 1\nnot found\n",
      stderr: "",
    });
    const outcome = await executePluginAction(planPluginAction(request), options(runner));
    expect(outcome.status === "failed" ? outcome.reason : "").toBe("not found");
  });

  it("reports a timeout distinctly from a failure", async () => {
    const runner = new FakeRunner({ status: "timed-out", stdout: "", stderr: "", timeoutMs: 60000 });
    const outcome = await executePluginAction(planPluginAction(request), options(runner));
    expect(outcome.status).toBe("failed");
    expect(outcome.status === "failed" ? outcome.reason : "").toContain("did not finish within 60s");
  });

  it("takes the outcome from the REQUEST, not from the argv it built", async () => {
    const runner = new FakeRunner();
    const uninstall = planPluginAction({ ...request, action: "uninstall" });
    const outcome = await executePluginAction(uninstall, options(runner));
    expect(outcome.status).toBe("uninstalled");
  });

  it("parses structured output where the tool offers it", async () => {
    const runner = new FakeRunner({
      status: "ok",
      exitCode: 0,
      stdout: '{"installed":"board@harness-kit","version":"0.2.0"}',
      stderr: "",
    });
    const outcome = await executePluginAction(
      planPluginAction({ ...request, surface: "codex" }),
      options(runner),
    );
    expect(outcome.status).toBe("installed");
    expect(outcome.status === "installed" ? outcome.details : undefined).toEqual({
      installed: "board@harness-kit",
      version: "0.2.0",
    });
  });

  it("does not fail an install because a tool lied about --json", async () => {
    const runner = new FakeRunner({ status: "ok", exitCode: 0, stdout: "done!", stderr: "" });
    const outcome = await executePluginAction(
      planPluginAction({ ...request, surface: "codex" }),
      options(runner),
    );
    expect(outcome.status).toBe("installed");
    expect(outcome.status === "installed" ? outcome.details : "x").toBeUndefined();
  });
});

describe("unpack driver (AC-19)", () => {
  const request = {
    surface: "opencode" as const,
    identity: "board@harness-kit",
    scope: "user" as const,
    action: "install" as const,
  };

  it("plans a copy into the surface's own skills directory", () => {
    const plan = planPluginAction(request);
    expect(plan.kind).toBe("unpack");
    if (plan.kind !== "unpack" || !plan.plan.supported) throw new Error("expected an unpack plan");
    expect(plan.plan.targetDirectory).toBe(getSurface("opencode").stores.find(
      (s) => s.kind === "skill" && s.scope === "user",
    )?.path);
  });

  it("writes the plugin's skills and reports exactly what it wrote", async () => {
    const cache = `${HOME}/.claude/plugins/cache/harness-kit/board/0.2.0`;
    const fs = new MockFsProvider(
      {
        [`${cache}/skills/review/SKILL.md`]: "# review",
        [`${cache}/skills/plan/SKILL.md`]: "# plan",
        [`${cache}/README.md`]: "not a skill",
      },
      PROJECT,
      HOME,
    );
    const outcome = await executePluginAction(planPluginAction(request), {
      runner: new FakeRunner(),
      fs,
      now: "2026-09-07T00:00:00.000Z",
      homeRoot: HOME,
      sourceSurface: "claude-code",
    });
    expect(outcome.status).toBe("installed");
    if (outcome.status !== "installed") return;
    expect(outcome.files.sort()).toEqual([
      `${HOME}/.config/opencode/skills/board/plan/SKILL.md`,
      `${HOME}/.config/opencode/skills/board/review/SKILL.md`,
    ]);
    expect(await fs.readFile(outcome.files[0])).toBe("# plan");
  });

  it("picks the newest version directory by NUMBER, not lexically", async () => {
    // "0.10.0" sorts before "0.9.0" as a string, so a lexical pick unpacks an
    // older release whose skill SET differs — skills the current version added
    // would be missing and ones it removed would be installed.
    const base = `${HOME}/.claude/plugins/cache/harness-kit/board`;
    const outcome = await executePluginAction(planPluginAction(request), {
      ...options(new FakeRunner(), {
        [`${base}/0.9.0/skills/old-skill/SKILL.md`]: "# old",
        [`${base}/0.10.0/skills/new-skill/SKILL.md`]: "# new",
      }),
      sourceSurface: "claude-code",
    });
    expect(outcome.status).toBe("installed");
    if (outcome.status !== "installed") return;
    expect(outcome.files).toEqual([
      `${HOME}/.config/opencode/skills/board/new-skill/SKILL.md`,
    ]);
  });

  it("refuses when the plugin's files are not on this machine", async () => {
    const outcome = await executePluginAction(planPluginAction(request), {
      ...options(new FakeRunner()),
      sourceSurface: "claude-code",
    });
    expect(outcome.status).toBe("refused");
    expect(outcome.status === "refused" ? outcome.reason : "").toContain("could not find");
  });

  it("refuses a plugin with nothing unpackable rather than reporting success", async () => {
    const cache = `${HOME}/.claude/plugins/cache/harness-kit/board/0.2.0`;
    const outcome = await executePluginAction(planPluginAction(request), {
      ...options(new FakeRunner(), { [`${cache}/README.md`]: "no skills here" }),
      sourceSurface: "claude-code",
    });
    expect(outcome.status).toBe("refused");
    expect(outcome.status === "refused" ? outcome.reason : "").toContain("no skills to unpack");
  });

  it("refuses to write through a symlink planted in the skills tree", async () => {
    // The guard the transaction engine applies and that writing directly
    // would otherwise lose. One symlink inside a skills directory — from
    // another installer, synced dotfiles, a previously unpacked plugin —
    // would turn "unpack a plugin" into a write to any reachable path.
    const cache = `${HOME}/.claude/plugins/cache/harness-kit/board/0.2.0`;
    const fs = new MockFsProvider(
      { [`${cache}/skills/review/SKILL.md`]: "# review" },
      PROJECT,
      HOME,
    );
    (fs as unknown as { isSymlink: (p: string) => Promise<boolean> }).isSymlink = async (
      candidate: string,
    ) => candidate === `${HOME}/.config/opencode/skills/board`;

    const outcome = await executePluginAction(planPluginAction(request), {
      runner: new FakeRunner(),
      fs,
      now: "2026-09-07T00:00:00.000Z",
      homeRoot: HOME,
      sourceSurface: "claude-code",
    });
    expect(outcome.status).toBe("failed");
    expect(outcome.status === "failed" ? outcome.reason : "").toContain("symbolic link");
  });

  it("reports an IO failure instead of throwing, per the never-throws contract", async () => {
    const cache = `${HOME}/.claude/plugins/cache/harness-kit/board/0.2.0`;
    const fs = new MockFsProvider(
      { [`${cache}/skills/review/SKILL.md`]: "# review" },
      PROJECT,
      HOME,
    );
    (fs as unknown as { writeFile: () => Promise<void> }).writeFile = async () => {
      throw new Error("EISDIR: illegal operation on a directory");
    };
    const outcome = await executePluginAction(planPluginAction(request), {
      runner: new FakeRunner(),
      fs,
      now: "2026-09-07T00:00:00.000Z",
      homeRoot: HOME,
      sourceSurface: "claude-code",
    });
    expect(outcome.status).toBe("failed");
    expect(outcome.status === "failed" ? outcome.reason : "").toContain("EISDIR");
  });

  it("refuses a source surface whose contents it cannot actually read", async () => {
    // Only Claude Code caches plugin contents on disk. Accepting `codex` and
    // silently shipping Claude Code's bytes under its name is worse than
    // refusing — the user picked a surface and would get another vendor's files.
    const outcome = await executePluginAction(planPluginAction(request), {
      ...options(new FakeRunner()),
      sourceSurface: "codex",
    });
    expect(outcome.status).toBe("refused");
    expect(outcome.status === "refused" ? outcome.reason : "").toContain("only claude-code");
  });

  it("prefers a release over its prerelease", () => {
    // `1.0.0-beta.1` must rank BELOW `1.0.0`; splitting on `-` as just another
    // separator ranked it above, unpacking a version nobody is running.
    const order = ["1.0.0", "1.0.0-beta.1", "0.10.0", "0.9.0", "2.1.0-rc.1", "2.1.0"];
    const sorted = [...order].sort(compareVersionsForTest);
    expect(sorted[sorted.length - 1]).toBe("2.1.0");
    expect(sorted.indexOf("1.0.0")).toBeGreaterThan(sorted.indexOf("1.0.0-beta.1"));
    expect(sorted.indexOf("0.10.0")).toBeGreaterThan(sorted.indexOf("0.9.0"));
  });

  it("says out loud that uninstall needs the recorded file list", async () => {
    const outcome = await executePluginAction(
      planPluginAction({ ...request, action: "uninstall" }),
      { ...options(new FakeRunner()), sourceSurface: "claude-code" },
    );
    expect(outcome.status).toBe("refused");
    expect(outcome.status === "refused" ? outcome.reason : "").toContain("file list");
  });
});

describe("planNativePluginAction is pure", () => {
  it("builds a command without touching a runner or the filesystem", () => {
    const installer = getSurface("claude-code").pluginInstall;
    if (installer?.kind !== "native") throw new Error("expected a native installer");
    const plan = planNativePluginAction(installer, {
      action: "install",
      identity: "a@b",
      scope: "user",
    });
    expect(plan.supported).toBe(true);
  });
});
