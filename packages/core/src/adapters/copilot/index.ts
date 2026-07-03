import type { FileAction, HarnessConfig } from "../../types.js";
import { compileInstructions } from "../../compile/instructions.js";
import { compileMcpServers } from "../../compile/mcp-servers.js";
import { compileSkills } from "../../compile/skills.js";
import { compilePermissions, buildPermissionsText } from "../../compile/permissions.js";
import { appendMarkerBlock, findMarkerBlock, replaceMarkerBlock } from "../../compile/markers.js";
import type { AdapterContext, AdapterCapabilities, FilePlan, HarnessAdapter } from "../adapter.js";
import type { ImportedFragment } from "../../import/types.js";
import { readInstructionFileAsOpaqueBlock } from "../../import/read-instructions.js";
import { readMcpConfigFile } from "../../import/read-mcp.js";

const TARGET = "copilot" as const;

// Declared honestly from exportConfig below: instructions
// (copilot-instructions.md + behavioral.instructions.md) and mcp
// (.vscode/mcp.json) are emitted — full. Skills copied to .github/skills —
// full. Permissions are described in instructions only, not enforced —
// partial. Subagents/hooks/model are not emitted at all.
//
// Import (WP-2.2): .github/copilot-instructions.md → opaque instruction
// block (frontmatter stripped, never parsed) — full. .vscode/mcp.json is
// structured JSON, reversed exactly — full. Skills/subagents/hooks/model/
// permissions have no importable structured artifact for copilot — none.
const capabilities: AdapterCapabilities = {
  export: {
    instructions: "full",
    skills: "full",
    subagents: "none",
    mcp: "full",
    permissions: "partial",
    hooks: "none",
    model: "none",
  },
  import: {
    instructions: "full",
    skills: "none",
    subagents: "none",
    mcp: "full",
    permissions: "none",
    hooks: "none",
    model: "none",
  },
  diff: false,
  scopes: ["project"],
};

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

/**
 * Reverse-import: .github/copilot-instructions.md → opaque instruction block
 * (operational slot only — copilot has no behavioral/identity file of its
 * own that this adapter reads back; behavioral.instructions.md, when
 * present, is also read as an additional opaque operational block since it's
 * still just prose, never parsed). .vscode/mcp.json → mcp-servers.
 */
async function importConfig(ctx: AdapterContext): Promise<ImportedFragment[]> {
  const fragments: ImportedFragment[] = [];
  const skipped: Array<{ file: string; reason: string }> = [];
  const blocks = [];

  const instructionFiles = [
    ".github/copilot-instructions.md",
    ".github/instructions/behavioral.instructions.md",
  ];

  for (const relPath of instructionFiles) {
    const block = await readInstructionFileAsOpaqueBlock(
      ctx.fs,
      relPath,
      "operational",
      "copilot",
      { stripFrontmatter: true },
    );
    if (block) {
      blocks.push(block);
    } else if (await ctx.fs.exists(ctx.fs.joinPath(ctx.projectRoot, relPath))) {
      skipped.push({
        file: relPath,
        reason: "file exists but contains only frontmatter and/or harness-kit-generated marker blocks — nothing new to import.",
      });
    }
  }

  if (blocks.length > 0) {
    fragments.push({
      domain: "instructions",
      config: {},
      warnings: [],
      instructions: { blocks },
      skipped,
    });
  }

  const { imported: mcpServers, skipped: mcpSkipped } = await readMcpConfigFile(
    ctx.fs,
    ".vscode/mcp.json",
    "copilot",
  );
  if (mcpServers) {
    fragments.push({
      domain: "mcp",
      config: {},
      warnings: [],
      mcpServers,
      skipped: mcpSkipped,
    });
  }

  return fragments;
}

export const copilotAdapter: HarnessAdapter = {
  id: "copilot",
  capabilities,
  detect,
  exportConfig,
  importConfig,
};
