import { createHash } from "node:crypto";
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
import { compileInstructions } from "./instructions.js";
import { compileMcpServers } from "./mcp-servers.js";
import { compileSkills } from "./skills.js";
import { compilePermissions, buildPermissionsText } from "./permissions.js";
import { appendMarkerBlock, findMarkerBlock, replaceMarkerBlock } from "./markers.js";

// ── Source fingerprint ────────────────────────────────────────

export function computeSourceFingerprint(
  yamlContent: string,
  config: HarnessConfig,
): string {
  const hash = createHash("sha256");
  hash.update(yamlContent);
  for (const plugin of config.plugins ?? []) {
    hash.update(plugin.name + plugin.source + (plugin.version ?? ""));
  }
  return hash.digest("hex");
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

  const harnessName = config.metadata?.name ?? "default";
  const cwd = fs.cwd();

  // Stage 3: Compute source fingerprint
  const fingerprint = computeSourceFingerprint(yamlString, config);
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

  // Stage 6: Generate instructions
  const instrResult = await compileInstructions(config, targets, fs);
  allFiles.push(...instrResult.files);
  allWarnings.push(...instrResult.warnings);

  if (config.permissions) {
    const permText = buildPermissionsText(config.permissions);
    if (permText) {
      appendPermissionsToInstructions(allFiles, config, permText);
    }
  }

  // Stage 7: Generate MCP config
  const mcpResult = await compileMcpServers(config, targets, fs);
  allFiles.push(...mcpResult.files);
  allWarnings.push(...mcpResult.warnings);

  // Compile skills + permissions
  const skillsResult = await compileSkills(config, targets, fs);
  allFiles.push(...skillsResult.files);
  allSkipped.push(...skillsResult.skippedPlugins);

  const permsResult = await compilePermissions(config, targets, fs);
  allFiles.push(...permsResult.files);
  allWarnings.push(...permsResult.warnings);

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

function appendPermissionsToInstructions(
  files: FileAction[],
  config: HarnessConfig,
  permText: string,
): void {
  const harnessName = config.metadata?.name ?? "default";

  for (const file of files) {
    if (file.slot === "operational" && file.platform !== "claude-code") {
      const existingBlock = findMarkerBlock(file.content, harnessName, "operational");
      if (existingBlock) {
        const newContent = existingBlock.content + "\n\n" + permText;
        file.content = replaceMarkerBlock(
          file.content,
          harnessName,
          "operational",
          newContent,
        );
      } else {
        file.content = appendMarkerBlock(
          file.content,
          harnessName,
          "permissions",
          permText,
        );
      }
    }
  }
}
