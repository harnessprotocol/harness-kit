import type { FileAction, HarnessConfig } from "../../types.js";
import { compileInstructions } from "../../compile/instructions.js";
import { compileMcpServers } from "../../compile/mcp-servers.js";
import { compileSkills } from "../../compile/skills.js";
import { compilePermissions, buildPermissionsText } from "../../compile/permissions.js";
import { appendMarkerBlock, findMarkerBlock, replaceMarkerBlock } from "../../compile/markers.js";
import type { AdapterContext, AdapterCapabilities, FilePlan, HarnessAdapter, DriftReport } from "../adapter.js";
import type { ImportedFragment } from "../../import/types.js";
import { readInstructionFileAsOpaqueBlock } from "../../import/read-instructions.js";
import { readMcpConfigFile } from "../../import/read-mcp.js";
import { detectInstructionDrift, toDriftReport } from "../../fix/detect.js";

const TARGET = "cursor" as const;

// Declared honestly from exportConfig below: instructions (harness.mdc +
// behavioral.mdc) and mcp (.cursor/mcp.json) are emitted — full. Skills are
// copied into .cursor/skills — full. Permissions are NOT machine-enforced for
// cursor (only described in instruction text, with a warning) — partial.
// Subagents/hooks/model are not emitted at all.
//
// Import (WP-2.2): every *.mdc rule file under .cursor/rules/ is read back
// as an opaque instruction block (frontmatter stripped, never parsed) —
// full. .cursor/mcp.json is structured JSON, reversed exactly — full.
// Skills/subagents/hooks/model/permissions have no importable structured
// artifact for cursor (permissions are prose-only, not machine-readable) —
// none.
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
  diff: true,
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
 * Reverse-import: every *.mdc file under .cursor/rules/ → one opaque
 * instruction block each (frontmatter stripped — it's tooling metadata, not
 * user prose). `harness.mdc` and `behavioral.mdc` are harness-kit's own
 * export filenames for the operational/behavioral slots respectively (see
 * instructions.ts's SLOT_MAPPINGS) — read back into the matching slot so a
 * round trip doesn't relocate previously-exported behavioral content into
 * the operational bucket. Any other *.mdc file (a user's own custom cursor
 * rule, not one harness-kit itself would have written) is a rule cursor
 * applies generally, so it defaults to the operational slot. .cursor/mcp.json
 * → mcp-servers.
 */
function slotForRuleFile(filename: string): "operational" | "behavioral" {
  if (filename === "behavioral.mdc") return "behavioral";
  return "operational";
}

async function importConfig(ctx: AdapterContext): Promise<ImportedFragment[]> {
  const fragments: ImportedFragment[] = [];
  const rulesDir = ".cursor/rules";
  const fullRulesDir = ctx.fs.joinPath(ctx.projectRoot, rulesDir);

  const blocks = [];
  const skipped: Array<{ file: string; reason: string }> = [];

  if (await ctx.fs.exists(fullRulesDir)) {
    let entries: string[] = [];
    try {
      entries = await ctx.fs.readDir(fullRulesDir);
    } catch {
      entries = [];
    }

    const mdcFiles = entries.filter((e) => e.endsWith(".mdc")).sort();
    for (const entry of mdcFiles) {
      const relPath = ctx.fs.joinPath(rulesDir, entry);
      const block = await readInstructionFileAsOpaqueBlock(
        ctx.fs,
        relPath,
        slotForRuleFile(entry),
        "cursor",
        { stripFrontmatter: true },
      );
      if (block) {
        blocks.push(block);
      } else {
        skipped.push({
          file: relPath,
          reason: "file exists but contains only frontmatter and/or harness-kit-generated marker blocks — nothing new to import.",
        });
      }
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
    ".cursor/mcp.json",
    "cursor",
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

/**
 * Drift detection (WP-2.3): harness.mdc/behavioral.mdc marker blocks vs
 * compiled output. Scoped to `instructions` — the only marker-delimited
 * domain this adapter owns (mcp.json is a structured file this adapter
 * merges into wholesale, not marker-based).
 */
async function diff(config: HarnessConfig, ctx: AdapterContext): Promise<DriftReport> {
  const items = await detectInstructionDrift(ctx.fs, config, [TARGET], "cursor");
  return toDriftReport(items);
}

export const cursorAdapter: HarnessAdapter = {
  id: "cursor",
  capabilities,
  detect,
  exportConfig,
  importConfig,
  diff,
};
