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
import { readClaudeSettingsPermissions } from "../../import/read-permissions.js";

const TARGET = "claude-code" as const;

// Declared honestly from what exportConfig below actually emits today:
// instructions (CLAUDE.md/AGENT.md/SOUL.md), mcp (.mcp.json), permissions
// (.claude/settings.json) — full. Skills are handled by Claude Code's plugin
// install system, not file emission here, so "none". Subagents/hooks/model
// are not emitted at all today.
//
// Import (WP-2.2): CLAUDE.md/AGENT.md/SOUL.md are read back as opaque
// instruction blocks (never parsed into structured fields) — full.
// .mcp.json is structured JSON, reversed exactly — full. .claude/settings.json
// permissions are structured JSON, reversed exactly — full. Skills are not
// read back (no on-disk artifact to reverse — claude-code skills come from
// the plugin install system, not a file this adapter can inspect) — none.
// Subagents/hooks/model have no importable artifact yet — none.
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
    instructions: "full",
    skills: "none",
    subagents: "none",
    mcp: "full",
    permissions: "full",
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

/**
 * Reverse-import: CLAUDE.md/AGENT.md/SOUL.md → opaque instruction blocks,
 * .claude/settings.json → permissions, .mcp.json → mcp-servers. Only
 * structured surfaces are parsed (JSON files); instruction file prose is
 * NEVER parsed, only stripped of harness-kit's own marker blocks and kept
 * verbatim.
 */
async function importConfig(ctx: AdapterContext): Promise<ImportedFragment[]> {
  const fragments: ImportedFragment[] = [];
  const instructionSkipped: Array<{ file: string; reason: string }> = [];

  const instructionFiles: Array<{ path: string; slot: "operational" | "behavioral" | "identity" }> = [
    { path: "CLAUDE.md", slot: "operational" },
    { path: "AGENT.md", slot: "behavioral" },
    { path: "SOUL.md", slot: "identity" },
  ];

  const blocks = [];
  for (const { path, slot } of instructionFiles) {
    const block = await readInstructionFileAsOpaqueBlock(ctx.fs, path, slot, "claude-code");
    if (block) {
      blocks.push(block);
    } else if (await ctx.fs.exists(ctx.fs.joinPath(ctx.projectRoot, path))) {
      instructionSkipped.push({
        file: path,
        reason: "file exists but contains only harness-kit-generated marker blocks — nothing new to import.",
      });
    }
  }

  if (blocks.length > 0) {
    fragments.push({
      domain: "instructions",
      config: {},
      warnings: [],
      instructions: { blocks },
      skipped: instructionSkipped,
    });
  }

  const permissions = await readClaudeSettingsPermissions(ctx.fs, ".claude/settings.json", "claude-code");
  if (permissions) {
    fragments.push({
      domain: "permissions",
      config: {},
      warnings: [],
      permissions,
    });
  }

  const { imported: mcpServers, skipped: mcpSkipped } = await readMcpConfigFile(
    ctx.fs,
    ".mcp.json",
    "claude-code",
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

export const claudeCodeAdapter: HarnessAdapter = {
  id: "claude-code",
  capabilities,
  detect,
  exportConfig,
  importConfig,
};
