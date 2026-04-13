import type { FsProvider } from "../fs-provider.js";
import { parseHarness } from "../parser/parse-harness.js";
import { validateHarness } from "../schema/validate.js";
import type {
  CompileOptions,
  CompileResult,
  FileAction,
  HarnessConfig,
  TargetPlatform,
} from "../types.js";
import { compileInstructions } from "./instructions.js";
import { appendMarkerBlock, findMarkerBlock, replaceMarkerBlock } from "./markers.js";
import { compileMcpServers } from "./mcp-servers.js";
import { buildPermissionsText, compilePermissions } from "./permissions.js";
import { compileSkills } from "./skills.js";

export async function compile(
  yamlString: string,
  targets: TargetPlatform[],
  fs: FsProvider,
  options: CompileOptions = {},
): Promise<CompileResult> {
  // Parse
  const { config } = parseHarness(yamlString);

  // Validate — fail fast
  const validation = validateHarness(config);
  if (!validation.valid) {
    const errMsgs = validation.errors.map((e) => `  ${e.path}: ${e.message}`).join("\n");
    throw new Error(`harness.yaml validation failed:\n${errMsgs}`);
  }

  const harnessName = config.metadata?.name ?? "default";
  const allFiles: FileAction[] = [];
  const allWarnings: string[] = [];
  const allSkipped: string[] = [];

  // Step 3: Compile instructions
  const instrResult = await compileInstructions(config, targets, fs);
  allFiles.push(...instrResult.files);
  allWarnings.push(...instrResult.warnings);

  // Append permissions text to non-Claude-Code instruction files
  if (config.permissions) {
    const permText = buildPermissionsText(config.permissions);
    if (permText) {
      appendPermissionsToInstructions(allFiles, config, permText);
    }
  }

  // Step 4: Compile MCP servers
  const mcpResult = await compileMcpServers(config, targets, fs);
  allFiles.push(...mcpResult.files);
  allWarnings.push(...mcpResult.warnings);

  // Step 5: Compile skills
  const skillsResult = await compileSkills(config, targets, fs);
  allFiles.push(...skillsResult.files);
  allSkipped.push(...skillsResult.skippedPlugins);

  // Step 6: Compile permissions (Claude Code settings.json)
  const permsResult = await compilePermissions(config, targets, fs);
  allFiles.push(...permsResult.files);
  allWarnings.push(...permsResult.warnings);

  // Write files (unless dry-run)
  if (!options.dryRun) {
    await writeFiles(allFiles, fs);
  }

  return {
    harnessName,
    targets,
    files: allFiles,
    warnings: allWarnings,
    skippedPlugins: allSkipped,
  };
}

function appendPermissionsToInstructions(
  files: FileAction[],
  config: HarnessConfig,
  permText: string,
): void {
  const harnessName = config.metadata?.name ?? "default";

  for (const file of files) {
    if (file.slot === "operational" && file.platform !== "claude-code") {
      // Append permissions text inside the marker block
      const existingBlock = findMarkerBlock(file.content, harnessName, "operational");
      if (existingBlock) {
        const newContent = existingBlock.content + "\n\n" + permText;
        file.content = replaceMarkerBlock(file.content, harnessName, "operational", newContent);
      } else {
        file.content = appendMarkerBlock(file.content, harnessName, "permissions", permText);
      }
    }
  }
}

async function writeFiles(files: FileAction[], fs: FsProvider): Promise<void> {
  const cwd = fs.cwd();

  for (const file of files) {
    if (file.action === "skip" || file.action === "needs-confirmation") {
      continue;
    }

    const fullPath = fs.joinPath(cwd, file.path);
    const dir = fs.dirname(fullPath);

    if (dir) {
      await fs.mkdir(dir, { recursive: true });
    }

    await fs.writeFile(fullPath, file.content);
  }
}
