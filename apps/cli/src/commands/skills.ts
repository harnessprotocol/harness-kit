import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { basename, relative, resolve } from "node:path";
import { stringify } from "yaml";
import {
  TARGETS,
  applyFileTransaction,
  collectCapsuleFiles,
  computeFileHash,
  createCapsuleManifest,
  findSkillFiles,
  parseHarness,
  validateCapsule,
  validateHarness,
} from "@harness-kit/core";
import type {
  CapsuleFile,
  HarnessConfig,
  HarnessScope,
  HarnessSkillRef,
  TransactionFileChange,
} from "@harness-kit/core";
import { NodeFsProvider } from "@harness-kit/core/node";
import { applyCommand } from "./apply.js";
import { rollbackCommand } from "./rollback.js";
import {
  buildReconciliationContext,
  readOptional,
  relativeInside,
  summarizePlan,
  timestamp,
} from "./portability-common.js";

const execFile = promisify(execFileCallback);

interface SkillLayerFlags {
  organization?: string;
  personal?: string;
  session?: string;
  target?: string;
  resolve?: string[];
  adopt?: boolean;
  yes?: boolean;
  json?: boolean;
}

interface DiscoverFlags {
  global?: boolean;
  json?: boolean;
}

interface PromoteFlags {
  mode?: "reference" | "capsule";
  scope?: Extract<HarnessScope, "personal" | "project">;
  profile?: string;
  source?: string;
  revision?: string;
  publisher?: string;
  name?: string;
  version?: string;
  include?: string[];
  replace?: boolean;
  yes?: boolean;
  json?: boolean;
}

function skillName(content: string, fallback: string): string {
  return content.match(/^name:\s*([^\r\n]+)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g, "") ?? fallback;
}

export async function skillsDiscoverCommand(flags: DiscoverFlags): Promise<void> {
  const fs = new NodeFsProvider();
  const project = resolve(".");
  const home = await fs.homedir();
  const roots = TARGETS.flatMap((target) => [
    { target: target.id, scope: "project" as const, path: resolve(project, target.skillsDir ?? ".claude/skills") },
    ...(flags.global
      ? [{ target: target.id, scope: "personal" as const, path: resolve(home, target.globalSkillsDir) }]
      : []),
  ]);
  const entries: Array<{ name: string; digest: string; path: string; scope: string; target: string }> = [];
  const seenPaths = new Set<string>();
  for (const root of roots) {
    if (!(await fs.exists(root.path))) continue;
    for (const path of await findSkillFiles(root.path, fs, 10)) {
      if (seenPaths.has(path)) continue;
      seenPaths.add(path);
      const content = await fs.readFile(path);
      entries.push({
        name: skillName(content, basename(resolve(path, ".."))),
        digest: `sha256:${computeFileHash(content)}`,
        path,
        scope: root.scope,
        target: root.target,
      });
    }
  }
  const byDigest = new Map<string, typeof entries>();
  const byName = new Map<string, typeof entries>();
  for (const entry of entries) {
    byDigest.set(entry.digest, [...(byDigest.get(entry.digest) ?? []), entry]);
    byName.set(entry.name, [...(byName.get(entry.name) ?? []), entry]);
  }
  const report = {
    skills: entries,
    duplicateGroups: [...byDigest.entries()]
      .filter(([, group]) => group.length > 1)
      .map(([digest, group]) => ({ digest, locations: group.map((entry) => entry.path) })),
    aliasCollisions: [...byName.entries()]
      .filter(([, group]) => new Set(group.map((entry) => entry.digest)).size > 1)
      .map(([name, group]) => ({ name, variants: group.map(({ digest, path }) => ({ digest, path })) })),
  };
  if (flags.json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`Discovered ${entries.length} deployed skill copy/copies.`);
    for (const entry of entries) console.log(`  ${entry.name.padEnd(24)} ${entry.scope.padEnd(8)} ${entry.target.padEnd(12)} ${entry.digest} ${entry.path}`);
    console.log(`${report.duplicateGroups.length} duplicate content group(s); ${report.aliasCollisions.length} alias collision(s).`);
  }
}

async function inferReference(directory: string): Promise<{ source: string; revision: string }> {
  const { stdout: rootOut } = await execFile("git", ["-C", directory, "rev-parse", "--show-toplevel"]);
  const repoRoot = rootOut.trim();
  const { stdout: revisionOut } = await execFile("git", ["-C", repoRoot, "rev-parse", "HEAD"]);
  const { stdout: remoteOut } = await execFile("git", ["-C", repoRoot, "remote", "get-url", "origin"]);
  const remote = remoteOut.trim().replace(/\.git$/, "");
  const match = remote.match(/github\.com[/:]([^/]+\/[^/]+)$/);
  if (!match) throw new Error("cannot infer owner/repo from the origin remote; pass --source owner/repo/path");
  const child = relative(repoRoot, directory).replaceAll("\\", "/");
  return {
    source: child && child !== "." ? `${match[1]}/${child}` : match[1],
    revision: revisionOut.trim(),
  };
}

async function addDependencyFiles(files: CapsuleFile[], include: string[] | undefined): Promise<void> {
  for (const dependencyPath of include ?? []) {
    const absolute = resolve(dependencyPath);
    const depFs = new NodeFsProvider(absolute);
    const mount = `dependencies/${basename(absolute)}`;
    if (await depFs.isDirectory(absolute)) {
      const dependencyFiles = await collectCapsuleFiles(depFs, absolute);
      files.push(...dependencyFiles.map((file) => ({ ...file, path: `${mount}/${file.path}` })));
    } else if (await depFs.exists(absolute)) {
      files.push({ path: `${mount}/${basename(absolute)}`, content: await depFs.readFile(absolute) });
    } else {
      throw new Error(`declared dependency does not exist: ${absolute}`);
    }
  }
}

async function loadPromotionProfile(path: string, scope: "personal" | "project"): Promise<HarnessConfig> {
  const existing = await readOptional(path);
  if (!existing) {
    return {
      $schema: "https://harnessprotocol.io/schema/v2/harness.schema.json",
      version: "2",
      kind: "profile",
      metadata: { name: `${scope}-catalog`, description: `${scope} Harness Kit catalog.` },
      scope,
    };
  }
  const { config } = parseHarness(existing);
  const validation = validateHarness(config);
  if (!validation.valid) throw new Error(`${path} is not a valid harness profile`);
  if (config.scope && config.scope !== scope) throw new Error(`${path} has scope '${config.scope}', expected '${scope}'`);
  return { ...config, version: "2", scope };
}

export async function skillsPromoteCommand(directory: string, flags: PromoteFlags): Promise<void> {
  const absolute = resolve(directory);
  const fs = new NodeFsProvider(absolute);
  if (!(await fs.isDirectory(absolute))) throw new Error(`skill directory not found: ${absolute}`);
  const files = await collectCapsuleFiles(fs, absolute);
  await addDependencyFiles(files, flags.include);
  const entrypoint = files.find((file) => file.path === "SKILL.md");
  if (!entrypoint) throw new Error(`${absolute} does not contain SKILL.md`);
  const name = flags.name ?? skillName(entrypoint.content, basename(absolute));
  const mode = flags.mode ?? "reference";
  if (mode !== "reference" && mode !== "capsule") {
    throw new Error(`unsupported promotion mode '${mode}'; expected reference or capsule`);
  }
  const inferred = mode === "reference" && (!flags.source || !flags.revision)
    ? await inferReference(absolute)
    : null;
  const source = flags.source ?? inferred?.source ?? `capsule:${flags.publisher ?? "personal"}/${name}`;
  const revision = flags.revision ?? inferred?.revision;
  if (mode === "reference" && !revision) throw new Error("reference promotion requires a pinned --revision");
  const manifest = createCapsuleManifest(
    { kind: "skill", source, name },
    flags.version ?? (mode === "reference" ? revision! : "0.1.0"),
    "SKILL.md",
    files,
  );
  const validation = validateCapsule(manifest, files);
  if (!validation.valid) {
    throw new Error(`capsule validation failed:\n${validation.findings.map((finding) => `  ${finding.code}: ${finding.detail}`).join("\n")}`);
  }

  const host = new NodeFsProvider();
  const home = await host.homedir();
  const digest = manifest.digest.slice("sha256:".length);
  const cacheRoot = resolve(home, ".harness/cache/resources", digest);
  const scope = flags.scope ?? "personal";
  if (scope !== "personal" && scope !== "project") {
    throw new Error(`unsupported catalog scope '${scope}'; expected personal or project`);
  }
  const profilePath = resolve(flags.profile ?? (scope === "personal" ? resolve(home, ".harness/harness.yaml") : "harness.yaml"));
  const profile = await loadPromotionProfile(profilePath, scope);
  const skill: HarnessSkillRef = {
    name,
    source,
    version: mode === "reference" ? revision : manifest.version,
    enabled: true,
    loading: "deferred",
    integrity: { sha256: digest },
  };
  const current = profile.skills ?? [];
  const collision = current.find((candidate) => candidate.name === name);
  if (collision && !flags.replace) {
    throw new Error(`profile already contains skill alias '${name}'; choose an explicit winner with --replace`);
  }
  profile.skills = [...current.filter((candidate) => candidate.name !== name), skill];

  const changes: TransactionFileChange[] = [];
  for (const file of files) {
    if (file.symlink) continue;
    const path = resolve(cacheRoot, "content", file.path);
    changes.push({ path: relativeInside(home, path), before: await readOptional(path), after: file.content });
  }
  const manifestPath = resolve(cacheRoot, mode === "capsule" ? "capsule.json" : "source.json");
  changes.push({
    path: relativeInside(home, manifestPath),
    before: await readOptional(manifestPath),
    after: `${JSON.stringify({ ...manifest, mode, ...(revision ? { revision } : {}) }, null, 2)}\n`,
  });
  changes.push({
    path: relativeInside(home, profilePath),
    before: await readOptional(profilePath),
    after: stringify(profile, { lineWidth: 0 }),
  });

  const preview = {
    mode,
    scope,
    identity: manifest.identity,
    version: manifest.version,
    revision,
    digest: manifest.digest,
    profile: profilePath,
    files: files.map((file) => file.path),
    findings: validation.findings,
    approvalRequired: !flags.yes,
  };
  if (flags.json) console.log(JSON.stringify(preview, null, 2));
  else {
    console.log(`Promotion preview: ${name} (${mode}), ${files.length} declared file(s), ${manifest.digest}.`);
    console.log(`  profile ${profilePath}`);
    if (!flags.yes) console.log("Preview only. Re-run with --yes to promote into the catalog.");
  }
  if (!flags.yes) return;
  const result = await applyFileTransaction(changes, { fs: new NodeFsProvider(home), timestamp: timestamp() });
  if (!result.committed) throw new Error(result.error ?? "promotion transaction failed");
  if (!flags.json) console.log(`Promoted ${name}. Rollback manifest: ${result.manifestPath}`);
}

export async function skillsReconcileCommand(path: string, flags: SkillLayerFlags): Promise<void> {
  const context = await buildReconciliationContext(path, flags);
  const plan = {
    ...context.plan,
    operations: context.plan.operations.filter((operation) => operation.identity.kind === "skill"),
    conflicts: context.plan.conflicts.filter((conflict) => conflict.identity.kind === "skill"),
    losses: context.plan.losses.map((report) => ({
      ...report,
      losses: report.losses.filter((loss) => loss.resource.kind === "skill"),
    })),
  };
  plan.blocked = plan.conflicts.length > 0 || plan.losses.some((report) => report.losses.some((loss) => !loss.recoverable));
  if (flags.json) console.log(JSON.stringify(summarizePlan(plan), null, 2));
  else {
    console.log(`Skill reconciliation: ${plan.operations.length} operation(s), ${plan.conflicts.length} conflict(s).`);
    for (const conflict of plan.conflicts) console.log(`  CONFLICT ${conflict.id} — ${conflict.detail}`);
  }
  if (plan.blocked) process.exitCode = 2;
}

export async function skillsApplyCommand(path: string, flags: SkillLayerFlags): Promise<void> {
  await applyCommand(path, flags, { resourceKind: "skill" });
}

export async function skillsUpdateCommand(path: string, flags: SkillLayerFlags): Promise<void> {
  await applyCommand(path, flags, { resourceKind: "skill" });
}

export async function skillsRollbackCommand(flags: { transaction?: string; yes?: boolean; json?: boolean }): Promise<void> {
  await rollbackCommand(flags);
}
