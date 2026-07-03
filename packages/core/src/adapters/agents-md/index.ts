import type { FileAction, HarnessConfig, TargetPlatform } from "../../types.js";
import { compileInstructions } from "../../compile/instructions.js";
import { compileMcpServers } from "../../compile/mcp-servers.js";
import { compileSkills } from "../../compile/skills.js";
import { compilePermissions, buildPermissionsText } from "../../compile/permissions.js";
import { appendMarkerBlock, findMarkerBlock, replaceMarkerBlock } from "../../compile/markers.js";
import { AGENTS_MD_TARGETS } from "../target-metadata.js";
import type { AdapterContext, AdapterCapabilities, FilePlan, HarnessAdapter } from "../adapter.js";
import type { ImportedFragment } from "../../import/types.js";
import { readInstructionFileAsOpaqueBlock } from "../../import/read-instructions.js";

/**
 * The AGENTS.md family. Today the compiler treats codex, opencode, windsurf,
 * gemini, and junie identically: they all read operational instructions from
 * a shared AGENTS.md, none support the behavioral/identity slots, and each
 * has its own MCP config path/format (or none) and skills directory — see
 * ../../compile/targets.ts (TARGETS) for the per-tool variant map this
 * adapter delegates to unchanged.
 *
 * `AGENTS_MD_TARGETS` (all legacy `TargetPlatform`s whose instructionFile is
 * "AGENTS.md") is the single source of truth for which legacy targets this
 * adapter covers — kept derived rather than hardcoded so it can't drift from
 * targets.ts.
 */
const LEGACY_TARGETS: TargetPlatform[] = AGENTS_MD_TARGETS;

// Declared honestly from exportConfig below: instructions (AGENTS.md,
// operational slot only — behavioral/identity are not supported by any tool
// in this family) — full for what IS supported, but the family only ever
// supports the operational slot, and no tool in the family machine-enforces
// permissions or handles subagents/hooks/model. Permissions ARE partially
// handled though: exportConfig below appends a human-readable permissions
// summary into the operational instruction text and emits a
// not-machine-enforceable warning (see permissions.ts's non-claude-code
// branch) — so "partial", not "none", for permissions; subagents/hooks/model
// have no such fallback at all, so those stay "none".
// MCP support varies by tool (codex + windsurf are null/global-only in
// targets.ts; opencode/gemini/junie write project-level JSON) — since this
// single adapter covers a mix, and the current compiler silently no-ops the
// unsupported ones (see mcp-servers.ts's per-target `mcpConfigFile` check),
// the honest declaration for the adapter AS A WHOLE is "partial". Skills are
// copied to each tool's own directory for all five — full.
const capabilities: AdapterCapabilities = {
  export: {
    instructions: "full",
    skills: "full",
    subagents: "none",
    mcp: "partial",
    permissions: "partial",
    hooks: "none",
    model: "none",
  },
  // Reverse-import for this family is instructions-only (per spec):
  // AGENTS.md is the one artifact all five tools in this family share and
  // that this adapter reads back reliably, as a single opaque operational
  // bucket — never parsed into structured fields. mcp/skills/permissions
  // vary too much per-tool within the family (or are prose-only) to import
  // structurally, so those stay "none".
  import: {
    instructions: "full",
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

  // Restrict to the requested subset of the family when the caller (the
  // compile.ts orchestrator) specifies one; otherwise compile for the whole
  // AGENTS.md family (standalone adapter usage).
  const requested = ctx.legacyTargets
    ? LEGACY_TARGETS.filter((t) => ctx.legacyTargets!.includes(t))
    : LEGACY_TARGETS;

  if (requested.length === 0) {
    return { files, warnings, skippedPlugins };
  }

  const instrResult = await compileInstructions(config, requested, ctx.fs);
  files.push(...instrResult.files);
  warnings.push(...instrResult.warnings);

  if (config.permissions) {
    const permText = buildPermissionsText(config.permissions);
    if (permText) {
      appendPermissionsToInstructions(files, config, permText);
    }
  }

  const mcpResult = await compileMcpServers(config, requested, ctx.fs);
  files.push(...mcpResult.files);
  warnings.push(...mcpResult.warnings);

  const skillsResult = await compileSkills(config, requested, ctx.fs);
  files.push(...skillsResult.files);
  skippedPlugins.push(...skillsResult.skippedPlugins);

  const permsResult = await compilePermissions(config, requested, ctx.fs);
  files.push(...permsResult.files);
  warnings.push(...permsResult.warnings);

  return { files, warnings, skippedPlugins };
}

async function detect(ctx: AdapterContext) {
  const { detectPlatforms } = await import("../../detect/detect-platforms.js");
  const detections = await detectPlatforms(ctx.fs);
  // First match among the family wins — detect() returns a single result per
  // adapter; per-tool disambiguation within the family is future work.
  const match = detections.find((d) => LEGACY_TARGETS.includes(d.platform));
  return match ?? null;
}

/**
 * Reverse-import: AGENTS.md → one opaque instruction block, operational slot
 * only (per spec: import = instructions-only, single operational bucket —
 * this family has no behavioral/identity file convention at all, see
 * instructions.ts's SLOT_MAPPINGS where every non-operational slot maps to
 * null for this family).
 */
async function importConfig(ctx: AdapterContext): Promise<ImportedFragment[]> {
  const block = await readInstructionFileAsOpaqueBlock(
    ctx.fs,
    "AGENTS.md",
    "operational",
    "agents-md",
  );

  if (!block) {
    const skipped: Array<{ file: string; reason: string }> = [];
    if (await ctx.fs.exists(ctx.fs.joinPath(ctx.projectRoot, "AGENTS.md"))) {
      skipped.push({
        file: "AGENTS.md",
        reason: "file exists but contains only harness-kit-generated marker blocks — nothing new to import.",
      });
    }
    if (skipped.length === 0) return [];
    return [
      {
        domain: "instructions",
        config: {},
        warnings: [],
        skipped,
      },
    ];
  }

  return [
    {
      domain: "instructions",
      config: {},
      warnings: [],
      instructions: { blocks: [block] },
      skipped: [],
    },
  ];
}

export const agentsMdAdapter: HarnessAdapter = {
  id: "agents-md",
  capabilities,
  detect,
  exportConfig,
  importConfig,
};
