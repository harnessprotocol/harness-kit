import type { FileAction, HarnessConfig } from "../../types.js";
import { compileInstructions } from "../../compile/instructions.js";
import { compileMcpServers } from "../../compile/mcp-servers.js";
import { compileSkills } from "../../compile/skills.js";
import { compilePermissions, buildPermissionsText } from "../../compile/permissions.js";
import { appendMarkerBlock, findMarkerBlock, replaceMarkerBlock } from "../../compile/markers.js";
import type { AdapterContext, AdapterCapabilities, FilePlan, HarnessAdapter } from "../adapter.js";

const TARGET = "claude-code" as const;

// Declared honestly from what exportConfig below actually emits today:
// instructions (CLAUDE.md/AGENT.md/SOUL.md), mcp (.mcp.json), permissions
// (.claude/settings.json) — full. Skills are handled by Claude Code's plugin
// install system, not file emission here, so "none". Subagents/hooks/model
// are not emitted at all today.
const capabilities: AdapterCapabilities = {
  export: {
    instructions: "full",
    skills: "none",
    subagents: "none",
    mcp: "full",
    permissions: "full",
    hooks: "none",
    model: "none",
  },
  import: {
    instructions: "none",
    skills: "none",
    subagents: "none",
    mcp: "none",
    permissions: "none",
    hooks: "none",
    model: "none",
  },
  diff: false,
  scopes: ["project"],
};

/**
 * Mirrors the exact `appendPermissionsToInstructions` behavior from the
 * pre-refactor compile.ts — appends non-enforceable permissions text into
 * the operational instruction block for non-claude-code files. This adapter
 * never touches non-claude-code files, so this is effectively a no-op for
 * claude-code (its own permissions go to .claude/settings.json instead), but
 * the function is kept faithful to the original for byte-for-byte parity in
 * case future callers combine adapters' outputs.
 */
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

async function exportConfig(
  config: HarnessConfig,
  ctx: AdapterContext,
): Promise<FilePlan> {
  const files: FileAction[] = [];
  const warnings: string[] = [];
  const skippedPlugins: string[] = [];

  const instrResult = await compileInstructions(config, [TARGET], ctx.fs);
  files.push(...instrResult.files);
  warnings.push(...instrResult.warnings);

  if (config.permissions) {
    const permText = buildPermissionsText(config.permissions);
    if (permText) {
      appendPermissionsToInstructions(files, config, permText);
    }
  }

  const mcpResult = await compileMcpServers(config, [TARGET], ctx.fs);
  files.push(...mcpResult.files);
  warnings.push(...mcpResult.warnings);

  const skillsResult = await compileSkills(config, [TARGET], ctx.fs);
  files.push(...skillsResult.files);
  skippedPlugins.push(...skillsResult.skippedPlugins);

  const permsResult = await compilePermissions(config, [TARGET], ctx.fs);
  files.push(...permsResult.files);
  warnings.push(...permsResult.warnings);

  return { files, warnings, skippedPlugins };
}

async function detect(ctx: AdapterContext) {
  const { detectPlatforms } = await import("../../detect/detect-platforms.js");
  const detections = await detectPlatforms(ctx.fs);
  return detections.find((d) => d.platform === TARGET) ?? null;
}

export const claudeCodeAdapter: HarnessAdapter = {
  id: "claude-code",
  capabilities,
  detect,
  exportConfig,
};
