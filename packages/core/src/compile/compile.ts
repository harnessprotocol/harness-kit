import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import type { FsProvider } from "../fs-provider.js";
import type {
  CompileOptions,
  CompileResult,
  FileAction,
  HarnessConfig,
  TargetPlatform,
} from "../types.js";
import { parseHarness } from "../parser/parse-harness.js";
import { validateHarness } from "../schema/validate.js";
import { resolveExtends } from "./extends.js";
import { groupTargetsByAdapter } from "../adapters/registry.js";
import { domainHasContent } from "../adapters/domain-content.js";
import { domainSkippedWarning, type AdapterContext, type HarnessDomain } from "../adapters/adapter.js";

const ALL_DOMAINS: HarnessDomain[] = [
  "instructions",
  "skills",
  "subagents",
  "mcp",
  "permissions",
  "hooks",
  "model",
];

// ── Source fingerprint ────────────────────────────────────────

export function computeSourceFingerprint(
  yamlContent: string,
  config: HarnessConfig,
): string {
  const hash = sha256.create();
  hash.update(new TextEncoder().encode(yamlContent));
  for (const plugin of config.plugins ?? []) {
    hash.update(
      new TextEncoder().encode(
        plugin.name + plugin.source + (plugin.version ?? ""),
      ),
    );
  }
  return bytesToHex(hash.digest());
}

// ── Fingerprint cache ─────────────────────────────────────────

const CACHE_DIR = ".harness";
const CACHE_FILE = ".harness/.last-compile";

interface CompileCache {
  fingerprint: string;
  timestamp: string;
  targets: string;
}

async function readCache(
  fs: FsProvider,
  cwd: string,
): Promise<CompileCache | null> {
  try {
    const raw = await fs.readFile(fs.joinPath(cwd, CACHE_FILE));
    return JSON.parse(raw) as CompileCache;
  } catch {
    return null;
  }
}

async function writeCache(
  fs: FsProvider,
  cwd: string,
  cache: CompileCache,
): Promise<void> {
  const dir = fs.joinPath(cwd, CACHE_DIR);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(fs.joinPath(cwd, CACHE_FILE), JSON.stringify(cache, null, 2) + "\n");
}

// ── Atomic write ──────────────────────────────────────────────

async function writeFileAtomic(
  fullPath: string,
  content: string,
  fs: FsProvider,
): Promise<void> {
  const tmpPath = fullPath + ".harness-tmp";
  await fs.writeFile(tmpPath, content);
  await fs.renameFile(tmpPath, fullPath);
}

// ── Main compile function ─────────────────────────────────────

export async function compile(
  yamlString: string,
  targets: TargetPlatform[],
  fs: FsProvider,
  options: CompileOptions = {},
): Promise<CompileResult> {
  // Stage 2: Parse + validate
  const { config } = parseHarness(yamlString);

  const validation = validateHarness(config);
  if (!validation.valid) {
    const errMsgs = validation.errors
      .map((e) => `  ${e.path}: ${e.message}`)
      .join("\n");
    throw new Error(`harness.yaml validation failed:\n${errMsgs}`);
  }

  const cwd = fs.cwd();

  // Phase 1b: resolve extends fragments into the effective config
  const resolvedConfig = await resolveExtends(config, fs, cwd);

  const harnessName = resolvedConfig.metadata?.name ?? "default";

  // Stage 3: Compute source fingerprint
  const fingerprint = computeSourceFingerprint(yamlString, resolvedConfig);
  const targetKey = [...targets].sort().join(",");

  // Stage 4: Skip if unchanged (bypass with --force or dry-run)
  if (!options.force && !options.dryRun) {
    const cached = await readCache(fs, cwd);
    if (cached?.fingerprint === fingerprint && cached?.targets === targetKey) {
      return {
        harnessName,
        targets,
        files: [],
        warnings: [],
        skippedPlugins: [],
        upToDate: true,
      };
    }
  }

  const allFiles: FileAction[] = [];
  const allWarnings: string[] = [];
  const allSkipped: string[] = [];

  // Stage 5: Resolve targets (already passed in — future: filter by detected binaries)

  // Stages 6-7: Generate instructions, MCP config, skills, and permissions by
  // dispatching to each target's adapter. Grouping preserves the exact same
  // shared-service calls (compileInstructions/compileMcpServers/compileSkills/
  // compilePermissions) the pre-refactor pipeline made — same inputs, same
  // targets subset per call, same bytes out. See adapters/registry.ts and
  // adapters/{claude-code,cursor,copilot,agents-md}/index.ts.
  const adapterGroups = groupTargetsByAdapter(targets);
  const ctx: AdapterContext = {
    fs,
    projectRoot: cwd,
    homeRoot: await fs.homedir(),
  };

  for (const { adapter, legacyTargets } of adapterGroups) {
    const groupCtx: AdapterContext = { ...ctx, legacyTargets };
    const plan = await adapter.exportConfig(resolvedConfig, groupCtx);
    allFiles.push(...plan.files);
    allWarnings.push(...plan.warnings);
    allSkipped.push(...plan.skippedPlugins);

    // AD-3: emitting a domain the adapter marks "none" when harness.yaml has
    // content for it must produce a structured warning, never throw.
    for (const domain of ALL_DOMAINS) {
      if (
        adapter.capabilities.export[domain] === "none" &&
        domainHasContent(resolvedConfig, domain)
      ) {
        allWarnings.push(
          domainSkippedWarning(
            adapter.id,
            domain,
            `Requested targets: ${legacyTargets.join(", ")}.`,
          ),
        );
      }
    }
  }

  // compileSkills resolves each plugin's SKILL.md content independently of
  // target (only file *placement* is per-target) — the pre-refactor pipeline
  // called it exactly once for the whole targets list, so a plugin with no
  // resolvable SKILL.md produced exactly one skip message per compile() call.
  // Dispatching per-adapter-group now calls compileSkills once per group, so
  // dedupe here to preserve that exact one-per-plugin cardinality.
  const dedupedSkipped = [...new Set(allSkipped)];
  allSkipped.length = 0;
  allSkipped.push(...dedupedSkipped);

  // Stage 8: Materialize — atomic writes (unless dry-run)
  if (!options.dryRun) {
    await materializeFiles(allFiles, fs, cwd);

    // Stage 10: Write fingerprint cache
    await writeCache(fs, cwd, {
      fingerprint,
      timestamp: new Date().toISOString(),
      targets: targetKey,
    });
  }

  return {
    harnessName,
    targets,
    files: allFiles,
    warnings: allWarnings,
    skippedPlugins: allSkipped,
    upToDate: false,
  };
}

async function materializeFiles(
  files: FileAction[],
  fs: FsProvider,
  cwd: string,
): Promise<void> {
  for (const file of files) {
    if (file.action === "skip" || file.action === "needs-confirmation") {
      continue;
    }

    const fullPath = fs.joinPath(cwd, file.path);
    const dir = fs.dirname(fullPath);
    if (dir) {
      await fs.mkdir(dir, { recursive: true });
    }

    await writeFileAtomic(fullPath, file.content, fs);
  }
}
