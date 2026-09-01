import { mkdtemp, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { captureCommand } from "../src/commands/capture.js";
import { applyCommand } from "../src/commands/apply.js";
import { rollbackCommand } from "../src/commands/rollback.js";
import { skillsPromoteCommand } from "../src/commands/skills.js";
import { buildReconciliationContext, parseTargets } from "../src/commands/portability-common.js";
import { digestValue, TARGETS } from "@harness-kit/core";
import type { HarnessConfig } from "@harness-kit/core";
import { syncOrganizationRollout } from "../src/commands/org-rollout.js";

describe.sequential("portability CLI workflows", () => {
  let root: string;
  let project: string;
  let home: string;
  let originalCwd: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "harness-portability-"));
    project = join(root, "project");
    home = join(root, "home");
    await mkdir(join(project, ".claude/skills/review"), { recursive: true });
    await mkdir(home, { recursive: true });
    await writeFile(
      join(project, ".claude/skills/review/SKILL.md"),
      "---\nname: review\ndescription: Review code\n---\n\n# Review\n",
    );
    await mkdir(join(project, ".codex"), { recursive: true });
    await writeFile(join(project, ".codex/config.toml"), 'model = "gpt-5"\n');
    originalCwd = process.cwd();
    process.chdir(project);
    vi.stubEnv("HOME", home);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("suggests copilot-vscode when the legacy copilot target is requested", () => {
    expect(() => parseTargets("copilot")).toThrow("did you mean copilot-vscode?");
  });

  it("captures, applies, and restores a whole transaction", async () => {
    await captureCommand({ scope: "project", yes: true });
    expect(await readFile(join(project, "harness.yaml"), "utf8")).toContain('version: "2.1"');

    await unlink(join(project, ".codex/config.toml"));
    await applyCommand("harness.yaml", { target: "codex", yes: true });
    expect(await readFile(join(project, ".agents/skills/review/SKILL.md"), "utf8")).toContain("# Review");
    expect(await readFile(join(project, ".codex/config.toml"), "utf8")).toContain('model = "gpt-5"');
    expect(await readFile(join(project, ".harness/state.json"), "utf8")).toContain("lastKnownGood");

    await rollbackCommand({ yes: true });
    await expect(readFile(join(project, ".agents/skills/review/SKILL.md"), "utf8")).rejects.toThrow();
  });

  it("previews capture by default and preserves source-only project intent", async () => {
    const original = [
      '$schema: "https://harnessprotocol.io/schema/v2/harness.schema.json"',
      'version: "2"',
      "kind: profile",
      "scope: project",
      "metadata:",
      "  name: existing",
      "  description: Existing portable intent",
      "plugins:",
      "  - name: review",
      "    source: acme/review",
      "policy:",
      "  require-integrity: true",
      "",
    ].join("\n");
    await writeFile(join(project, "harness.yaml"), original);

    await captureCommand({ scope: "project" });
    expect(await readFile(join(project, "harness.yaml"), "utf8")).toBe(original);
    await captureCommand({ scope: "project", yes: true, force: true });
    const captured = await readFile(join(project, "harness.yaml"), "utf8");
    expect(captured).toContain("source: acme/review");
    expect(captured).toContain("require-integrity: true");
    expect(captured).toContain("codex:");
  });

  it("persists use-current conflict resolution into the project profile", async () => {
    const profilePath = join(project, "harness.yaml");
    await writeFile(profilePath, [
      '$schema: "https://harnessprotocol.io/schema/v2/harness.schema.json"',
      'version: "2"',
      "kind: profile",
      "scope: project",
      "metadata:",
      "  name: conflict",
      "  description: Conflict fixture",
      "instructions:",
      "  operational: Base instruction.",
      "",
    ].join("\n"));
    await applyCommand("harness.yaml", { target: "codex", yes: true });
    const nativePath = join(project, "AGENTS.md");
    await writeFile(nativePath, (await readFile(nativePath, "utf8")).replace("Base instruction.", "Current instruction."));
    await writeFile(profilePath, (await readFile(profilePath, "utf8")).replace("Base instruction.", "Desired instruction."));
    const conflict = (await buildReconciliationContext("harness.yaml", { target: "codex" })).plan.conflicts[0];
    expect(conflict).toBeTruthy();

    await applyCommand("harness.yaml", {
      target: "codex",
      yes: true,
      resolve: [`${conflict.id}=use-current`],
    });
    expect(await readFile(profilePath, "utf8")).toContain("Current instruction.");
    expect((await buildReconciliationContext("harness.yaml", { target: "codex" })).plan.conflicts).toEqual([]);
  });

  it("promotes a validated capsule into the personal content-addressed catalog", async () => {
    const source = join(root, "shared-review");
    await mkdir(join(source, "scripts"), { recursive: true });
    await writeFile(
      join(source, "SKILL.md"),
      "---\nname: shared-review\ndescription: Shared review\n---\n\n# Shared\n",
    );
    await writeFile(join(source, "scripts/check.sh"), "#!/bin/sh\necho ok\n");

    await skillsPromoteCommand(source, { mode: "capsule", scope: "personal", yes: true });
    const profile = await readFile(join(home, ".harness/harness.yaml"), "utf8");
    expect(profile).toContain("capsule:personal/shared-review");
    expect(profile).toMatch(/sha256:\s*[a-f0-9]{64}/);
    expect(await readFile(join(home, ".codex/skills/shared-review/SKILL.md"), "utf8")).toContain("# Shared");
    expect(await readFile(join(home, ".cursor/skills/shared-review/scripts/check.sh"), "utf8")).toContain("echo ok");
  });

  it("treats intact managed-only instructions as the current reconciliation peer", async () => {
    const managedProject = join(root, "managed-project");
    await mkdir(managedProject, { recursive: true });
    process.chdir(managedProject);
    await writeFile(join(managedProject, "harness.yaml"), [
      '$schema: "https://harnessprotocol.io/schema/v2/harness.schema.json"',
      'version: "2"',
      "kind: profile",
      "scope: project",
      "metadata:",
      "  name: managed",
      "  description: Managed instructions",
      "instructions:",
      "  operational: Use the managed review workflow.",
      "",
    ].join("\n"));
    await applyCommand("harness.yaml", { target: "codex", yes: true });
    const context = await buildReconciliationContext("harness.yaml", { target: "codex" });
    expect(context.plan.conflicts).toEqual([]);
    expect(context.plan.operations.find((operation) => operation.identity.kind === "instructions")?.direction).toBe("noop");
  });

  it("round-trips normalized skills and instructions across all eight targets", async () => {
    for (const target of TARGETS) {
      const targetProject = join(root, `round-trip-${target.id}`);
      await mkdir(join(targetProject, "skill-source"), { recursive: true });
      await writeFile(
        join(targetProject, "skill-source/SKILL.md"),
        "---\nname: portable-review\ndescription: Portable review\n---\n\n# Portable review\n",
      );
      await writeFile(join(targetProject, "harness.yaml"), [
        '$schema: "https://harnessprotocol.io/schema/v2/harness.schema.json"',
        'version: "2"',
        "kind: profile",
        "scope: project",
        "metadata:",
        `  name: round-trip-${target.id}`,
        "  description: Cross-target round trip",
        "skills:",
        "  - name: portable-review",
        "    source: ./skill-source",
        "instructions:",
        "  operational: Use the portable review workflow.",
        "",
      ].join("\n"));
      process.chdir(targetProject);
      await applyCommand("harness.yaml", { target: target.id, yes: true });
      const skillDir = target.id === "claude-code" ? ".claude/skills" : target.skillsDir!;
      expect(await readFile(join(targetProject, skillDir, "portable-review/SKILL.md"), "utf8")).toContain("# Portable review");
      const context = await buildReconciliationContext("harness.yaml", { target: target.id });
      expect(context.plan.conflicts, target.id).toEqual([]);
      const portableOperations = context.plan.operations
        .filter((operation) => ["skill", "instructions"].includes(operation.identity.kind));
      expect(
        portableOperations.every((operation) => operation.direction === "noop"),
        `${target.id}: ${portableOperations.map((operation) => `${operation.identity.kind}=${operation.direction}`).join(", ")}`,
      ).toBe(true);
    }
  });

  it("detects an extra file added to a managed skill as peer divergence", async () => {
    const targetProject = join(root, "skill-divergence");
    await mkdir(join(targetProject, "skill-source"), { recursive: true });
    await writeFile(join(targetProject, "skill-source/SKILL.md"), "---\nname: review\ndescription: Review\n---\n\n# Review\n");
    await writeFile(join(targetProject, "harness.yaml"), [
      '$schema: "https://harnessprotocol.io/schema/v2/harness.schema.json"',
      'version: "2"',
      "kind: profile",
      "scope: project",
      "metadata:",
      "  name: divergence",
      "  description: Divergence fixture",
      "skills:",
      "  - name: review",
      "    source: ./skill-source",
      "",
    ].join("\n"));
    process.chdir(targetProject);
    await applyCommand("harness.yaml", { target: "codex", yes: true });
    await writeFile(join(targetProject, ".agents/skills/review/LOCAL.md"), "local-only\n");
    const context = await buildReconciliationContext("harness.yaml", { target: "codex" });
    expect(context.plan.operations.find((operation) => operation.identity.kind === "skill")?.direction).toBe("capture-current");
  });

  it("blocks deployment when local skill bytes do not match the integrity pin", async () => {
    const targetProject = join(root, "integrity-mismatch");
    await mkdir(join(targetProject, "skill-source"), { recursive: true });
    await writeFile(join(targetProject, "skill-source/SKILL.md"), "---\nname: review\ndescription: Review\n---\n\n# Tampered\n");
    await writeFile(join(targetProject, "harness.yaml"), [
      '$schema: "https://harnessprotocol.io/schema/v2/harness.schema.json"',
      'version: "2"',
      "kind: profile",
      "scope: project",
      "metadata:",
      "  name: integrity-mismatch",
      "  description: Integrity mismatch fixture",
      "skills:",
      "  - name: review",
      "    source: ./skill-source",
      `    integrity: { sha256: ${"a".repeat(64)} }`,
      "",
    ].join("\n"));
    process.chdir(targetProject);
    await expect(applyCommand("harness.yaml", { target: "codex", yes: true })).rejects.toThrow("integrity mismatch");
    await expect(readFile(join(targetProject, ".agents/skills/review/SKILL.md"), "utf8")).rejects.toThrow();
  });

  it("retains managed files and ownership for targets outside a scoped apply", async () => {
    const targetProject = join(root, "target-scoped");
    await mkdir(join(targetProject, "skill-source"), { recursive: true });
    await writeFile(join(targetProject, "skill-source/SKILL.md"), "---\nname: review\ndescription: Review\n---\n\n# Review\n");
    await writeFile(join(targetProject, "harness.yaml"), [
      '$schema: "https://harnessprotocol.io/schema/v2/harness.schema.json"',
      'version: "2"',
      "kind: profile",
      "scope: project",
      "metadata:",
      "  name: target-scoped",
      "  description: Target scoped fixture",
      "skills:",
      "  - name: review",
      "    source: ./skill-source",
      "",
    ].join("\n"));
    process.chdir(targetProject);
    await applyCommand("harness.yaml", { target: "codex", yes: true });
    await applyCommand("harness.yaml", { target: "cursor", yes: true });

    expect(await readFile(join(targetProject, ".agents/skills/review/SKILL.md"), "utf8")).toContain("# Review");
    expect(await readFile(join(targetProject, ".cursor/skills/review/SKILL.md"), "utf8")).toContain("# Review");
    const state = JSON.parse(await readFile(join(targetProject, ".harness/state.json"), "utf8")) as {
      ownership: Array<{ target: string }>;
    };
    expect(new Set(state.ownership.map((entry) => entry.target))).toEqual(new Set(["codex", "cursor"]));
  });

  it("applies an assigned organization profile and reports rollout health", async () => {
    await writeFile(join(project, "harness.yaml"), [
      '$schema: "https://harnessprotocol.io/schema/v2/harness.schema.json"',
      'version: "2"',
      "kind: profile",
      "scope: project",
      "metadata:",
      "  name: rollout-project",
      "  description: Rollout project",
      "",
    ].join("\n"));
    const profile: HarnessConfig = {
      version: "2",
      kind: "profile",
      scope: "organization",
      metadata: { name: "engineering", description: "Engineering policy" },
      instructions: { operational: "Use the organization review workflow." },
    };
    const digest = digestValue(profile);
    const rollout = {
      id: "rollout-1",
      artifactId: `org-1:${digest}`,
      releaseDigest: digest,
      status: "active",
      effectiveAt: "2020-01-01T00:00:00.000Z",
      rings: [{ name: "all", percentage: 100 }],
      deviceReports: [],
    };
    const requests: Array<{ path: string; body?: string }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
      requests.push({ path: url.pathname, body: init?.body as string | undefined });
      const body = url.pathname.endsWith("/policy")
        ? { automaticUpdates: true }
        : url.pathname.endsWith("/rollouts")
          ? [rollout]
          : url.pathname.endsWith("/blob")
            ? { profile }
            : rollout;
      return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    }));

    await syncOrganizationRollout("org-1", { project: "harness.yaml", target: "codex", json: true });

    expect(await readFile(join(project, "AGENTS.md"), "utf8")).toContain("organization review workflow");
    expect(await readFile(join(project, ".harness/device.json"), "utf8")).toContain(digest);
    expect(await readFile(join(project, ".harness/.gitignore"), "utf8")).toBe("*\n");
    expect(requests.some((request) => request.path.endsWith("/rollouts/rollout-1/report") && request.body?.includes('"healthy"'))).toBe(true);
  });

  it("persists a stable rollout installation identity before ring eligibility", async () => {
    await writeFile(join(project, "harness.yaml"), [
      '$schema: "https://harnessprotocol.io/schema/v2/harness.schema.json"',
      'version: "2"',
      "kind: profile",
      "scope: project",
      "metadata:",
      "  name: rollout-project",
      "  description: Rollout project",
      "",
    ].join("\n"));
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
      return Response.json(url.pathname.endsWith("/policy") ? { automaticUpdates: false } : []);
    }));

    await syncOrganizationRollout("org-1", { project: "harness.yaml", json: true });
    const first = JSON.parse(await readFile(join(project, ".harness/device.json"), "utf8")) as { installationId: string };
    await syncOrganizationRollout("org-1", { project: "harness.yaml", json: true });
    const second = JSON.parse(await readFile(join(project, ".harness/device.json"), "utf8")) as { installationId: string };
    expect(second.installationId).toBe(first.installationId);
  });

  it("reports a failed rollout when artifact preflight rejects its profile", async () => {
    await writeFile(join(project, "harness.yaml"), [
      '$schema: "https://harnessprotocol.io/schema/v2/harness.schema.json"',
      'version: "2"',
      "kind: profile",
      "scope: project",
      "metadata:",
      "  name: rollout-project",
      "  description: Rollout project",
      "",
    ].join("\n"));
    const profile: HarnessConfig = {
      version: "2",
      kind: "profile",
      scope: "organization",
      metadata: { name: "unsafe-local", description: "Local organization source" },
      skills: [{ name: "local", source: "./skills/local", integrity: { sha256: "a".repeat(64) } }],
    };
    const digest = digestValue(profile);
    const rollout = {
      id: "rollout-preflight",
      artifactId: `org-1:${digest}`,
      releaseDigest: digest,
      status: "active",
      effectiveAt: "2020-01-01T00:00:00.000Z",
      rings: [{ name: "all", percentage: 100 }],
      deviceReports: [],
    };
    const requests: Array<{ path: string; body?: string }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
      requests.push({ path: url.pathname, body: init?.body as string | undefined });
      const body = url.pathname.endsWith("/policy")
        ? { automaticUpdates: true }
        : url.pathname.endsWith("/rollouts")
          ? [rollout]
          : url.pathname.endsWith("/blob")
            ? { profile }
            : rollout;
      return Response.json(body);
    }));

    await expect(syncOrganizationRollout("org-1", { project: "harness.yaml", target: "codex", json: true }))
      .rejects.toThrow("must use an immutable registry or repository source");
    expect(requests.some((request) => request.path.endsWith("/rollouts/rollout-preflight/report") && request.body?.includes('"failed"'))).toBe(true);
  });
});
