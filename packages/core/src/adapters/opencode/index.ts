import type { FileAction, HarnessConfig } from "../../types.js";
import { compileInstructions } from "../../compile/instructions.js";
import { compileSkills } from "../../compile/skills.js";
import { buildPermissionsText } from "../../compile/permissions.js";
import { appendMarkerBlock, findMarkerBlock, replaceMarkerBlock } from "../../compile/markers.js";
import type { AdapterContext, AdapterCapabilities, FilePlan, HarnessAdapter, DriftReport } from "../adapter.js";
import type { ImportedFragment } from "../../import/types.js";
import { readInstructionFileAsOpaqueBlock } from "../../import/read-instructions.js";
import { detectInstructionDrift, toDriftReport } from "../../fix/detect.js";
import { compileOpenCodeConfigFile } from "./config-file.js";
import { readOpenCodeMcp } from "./mcp.js";
import { readOpenCodePermissions } from "./permissions.js";

const TARGET = "opencode" as const;

/**
 * Dedicated OpenCode adapter (WP-2.5).
 *
 * OpenCode is already handled generically by the `agents-md` family
 * (AGENTS.md operational instructions, shared with codex/windsurf/gemini/
 * junie) for the LEGACY compile.ts pipeline — that mapping is left
 * completely untouched (see registry.ts's LEGACY_TARGET_TO_ADAPTER and the
 * golden compile tests, which must still produce byte-identical output for
 * the "opencode" TargetPlatform via agents-md).
 *
 * This adapter is a separate, richer, STANDALONE surface: it targets
 * OpenCode's actual native config surfaces beyond what the generic family
 * can express — `opencode.json`'s `mcp`/`permission` keys (verified against
 * the real installed config at ~/.config/opencode/opencode.json v1.3.13) and
 * `.opencode/skills`. It is invoked directly via getAdapter("opencode") and
 * is picked up automatically by importProject()'s getAllAdapters() loop; it
 * is NOT wired into groupTargetsByAdapter/compile()'s legacy TargetPlatform
 * dispatch, so it never changes what `compile()` produces for "opencode" as
 * a legacy target.
 *
 * Instructions still go through the shared AGENTS.md convention (reusing
 * compileInstructions exactly the way agents-md does — OpenCode reads
 * AGENTS.md natively, falling back to CLAUDE.md, confirmed in the spike) —
 * that part is legitimate shared-service reuse, not duplication. What's new
 * here is the mcp/permissions serialization: OpenCode's opencode.json shape
 * (`mcp: { name: { type: "local", command: [...], environment } }`,
 * `permission: { bash: { glob: verdict } }`) is structurally different from
 * the generic `{ mcpServers: {...} }` / `.claude/settings.json` shapes the
 * shared compile/mcp-servers.ts and compile/permissions.ts helpers produce,
 * so this adapter owns its own translate/reverse logic (see ./config-file.ts,
 * ./mcp.ts, ./permissions.ts). Both mcp and permissions live in the SAME
 * native file, so this adapter emits ONE merged FileAction for opencode.json
 * rather than two separate writes.
 *
 * Capabilities, declared honestly per the WP-2.0 spike verdict (confirmed
 * against the real installed config):
 *   instructions: partial — AGENTS.md (operational only; OpenCode has no
 *     behavioral/identity file convention) — "partial" per the spike's own
 *     verdict language (single bucket, not the full 3-slot model).
 *   skills: full — Agent-Skills format (SKILL.md), written to
 *     .opencode/skills (OpenCode natively reads Agent-Skills AND falls back
 *     to .claude/skills, confirmed by the spike).
 *   subagents: partial — .opencode/agent/*.md exists as a real surface but
 *     this adapter does not emit or import it (no HarnessConfig.subagents
 *     field yet) — "partial" reflects "the tool supports it, we don't wire
 *     it up yet", distinct from pi's honest "none" (no such surface exists).
 *   mcp: full — opencode.json's `mcp` key, round-trips exactly.
 *   permissions: partial — opencode.json's `permission.bash` glob→verdict
 *     map covers allow/ask/deny but has no path/network allowlist concept.
 *   hooks: partial — OpenCode has a documented hook surface the spike
 *     verdict marks partial; this adapter does not emit/import it.
 *   model: partial — opencode.json can set a default model; this adapter
 *     does not emit/import it yet.
 */
const capabilities: AdapterCapabilities = {
  export: {
    instructions: "partial",
    skills: "full",
    subagents: "partial",
    mcp: "full",
    permissions: "partial",
    hooks: "partial",
    model: "partial",
  },
  import: {
    instructions: "full",
    skills: "none",
    subagents: "none",
    mcp: "full",
    permissions: "partial",
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
        file.content = replaceMarkerBlock(file.content, harnessName, "operational", newContent);
      } else {
        file.content = appendMarkerBlock(file.content, harnessName, "permissions", permText);
      }
    }
  }
}

async function exportConfig(config: HarnessConfig, ctx: AdapterContext): Promise<FilePlan> {
  const files: FileAction[] = [];
  const warnings: string[] = [];
  const skippedPlugins: string[] = [];

  // Instructions: shared AGENTS.md convention (same shared service the
  // agents-md family uses — legitimate reuse per the WP, not new logic).
  const instrResult = await compileInstructions(config, [TARGET], ctx.fs);
  files.push(...instrResult.files);
  warnings.push(...instrResult.warnings);

  // MCP + permissions: OpenCode-native opencode.json (new emit logic — see
  // ./config-file.ts). Both domains share one file, so this is a single
  // merged write.
  const configFileResult = await compileOpenCodeConfigFile(config, ctx.fs);
  warnings.push(...configFileResult.warnings);
  if (configFileResult.file) {
    files.push(configFileResult.file);
  }

  // Append a human-readable permissions summary to AGENTS.md for anything
  // not machine-enforceable (paths/network), matching every other adapter's
  // pattern (see claude-code/cursor/copilot/agents-md's identical helper).
  if (config.permissions) {
    const permText = buildPermissionsText(config.permissions);
    if (permText) {
      appendPermissionsToInstructions(files, config, permText);
    }
  }

  const skillsResult = await compileSkills(config, [TARGET], ctx.fs);
  files.push(...skillsResult.files);
  skippedPlugins.push(...skillsResult.skippedPlugins);

  return { files, warnings, skippedPlugins };
}

async function detect(ctx: AdapterContext) {
  const { detectPlatforms } = await import("../../detect/detect-platforms.js");
  const detections = await detectPlatforms(ctx.fs);
  return detections.find((d) => d.platform === TARGET) ?? null;
}

/**
 * Reverse-import: AGENTS.md → opaque operational instruction block,
 * opencode.json's `mcp`/`permission.bash` → mcp-servers/permissions.
 */
async function importConfig(ctx: AdapterContext): Promise<ImportedFragment[]> {
  const fragments: ImportedFragment[] = [];

  const block = await readInstructionFileAsOpaqueBlock(ctx.fs, "AGENTS.md", "operational", "opencode");
  if (block) {
    fragments.push({
      domain: "instructions",
      config: {},
      warnings: [],
      instructions: { blocks: [block] },
      skipped: [],
    });
  } else if (await ctx.fs.exists(ctx.fs.joinPath(ctx.projectRoot, "AGENTS.md"))) {
    fragments.push({
      domain: "instructions",
      config: {},
      warnings: [],
      skipped: [
        {
          file: "AGENTS.md",
          reason: "file exists but contains only harness-kit-generated marker blocks — nothing new to import.",
        },
      ],
    });
  }

  const { imported: mcpServers, skipped: mcpSkipped } = await readOpenCodeMcp(ctx.fs, "opencode");
  if (mcpServers) {
    fragments.push({ domain: "mcp", config: {}, warnings: [], mcpServers, skipped: mcpSkipped });
  }

  const permissions = await readOpenCodePermissions(ctx.fs, "opencode");
  if (permissions) {
    fragments.push({ domain: "permissions", config: {}, warnings: [], permissions });
  }

  return fragments;
}

/**
 * Drift detection (WP-2.3): AGENTS.md's operational marker block vs compiled
 * output. Scoped to `instructions` — opencode.json is a structured file this
 * adapter merges into wholesale (like agents-md's mcp handling), not
 * marker-delimited, so it's out of scope for marker-based drift.
 */
async function diff(config: HarnessConfig, ctx: AdapterContext): Promise<DriftReport> {
  const items = await detectInstructionDrift(ctx.fs, config, [TARGET], "opencode");
  return toDriftReport(items);
}

export const opencodeAdapter: HarnessAdapter = {
  id: "opencode",
  capabilities,
  detect,
  exportConfig,
  importConfig,
  diff,
};
