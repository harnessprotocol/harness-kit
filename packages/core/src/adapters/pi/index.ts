import type { FileAction, HarnessConfig, TargetPlatform } from "../../types.js";
import { appendMarkerBlock, findMarkerBlock, replaceMarkerBlock } from "../../compile/markers.js";
import type { AdapterContext, AdapterCapabilities, FilePlan, HarnessAdapter, DetectResult, DriftReport } from "../adapter.js";
import type { ImportedFragment } from "../../import/types.js";
import { readInstructionFileAsOpaqueBlock } from "../../import/read-instructions.js";
import { toDriftReport } from "../../fix/detect.js";

/**
 * pi (@mariozechner/pi-coding-agent, confirmed v0.67.68 installed on this
 * machine) adapter (WP-2.5).
 *
 * pi is deliberately minimal by design — confirmed against the real
 * ~/.pi/agent/ config and the pi CLI's own `--help` output (no `mcp`
 * subcommand at all, `--tools` is a flat comma-separated enable/disable list
 * with no path/network scoping, no subagent or hook concept anywhere in the
 * CLI surface). Declaring most domains "none" here is the HONEST answer, not
 * a shortcoming of this adapter — see the WP-2.0 spike verdict this was
 * built from, reconfirmed by decompiling the installed CLI's
 * dist/core/resource-loader.js and dist/core/skills.js:
 *
 *   - System prompt resolution (resource-loader.js
 *     discoverSystemPromptFile/discoverAppendSystemPromptFile): project
 *     `.pi/SYSTEM.md` (full override) or `.pi/APPEND_SYSTEM.md` (appended to
 *     the default coding-assistant prompt) beats the global
 *     `~/.pi/agent/SYSTEM.md` / `~/.pi/agent/APPEND_SYSTEM.md` equivalents.
 *     Separately, pi also reads AGENTS.md/CLAUDE.md (in that preference
 *     order) as project CONTEXT files — a second, independent single-bucket
 *     surface, not the system prompt itself.
 *   - Skills (skills.js loadSkillsFromDirInternal): loads Agent-Skills
 *     (SKILL.md) from `~/.pi/agent/skills` (user scope) and `.pi/skills`
 *     (project scope) — confirmed installed skills enumerate correctly via
 *     `pi config`'s TUI on this machine.
 *   - No `mcp` command anywhere in `pi --help`/`pi <cmd> --help` output —
 *     confirmed by running it live. pi's own docs describe MCP-like needs as
 *     "build an extension" instead (see dist/core/extensions/loader.js) —
 *     there is no MCP client at all, so "none" is correct, not a gap.
 *   - `--tools <tools>` is a flat, comma-separated enable/disable list
 *     (read,bash,edit,write,grep,find,ls) with no glob/path/network scoping
 *     of any kind — there is nothing structurally analogous to
 *     harness.yaml's permissions.tools.{allow,deny,ask} beyond a crude
 *     enable/disable, and nothing at all analogous to permissions.paths or
 *     permissions.network. "none", not "partial" — a partial declaration
 *     would imply a real (if incomplete) mapping exists; it does not.
 *   - No subagent concept in the CLI or config schema at all (by design,
 *     confirmed in the spike and the CLI surface) — "none".
 *   - No hooks concept as CONFIG (spawning custom logic is done via
 *     extensions/*.ts, which is programmatic, not a declarative hook
 *     harness-kit could emit into) — "none".
 *   - Model: settings.json's defaultProvider/defaultModel is a single
 *     scalar pair (confirmed against the real ~/.pi/agent/settings.json:
 *     `{"defaultProvider":"ollama","defaultModel":"qwen2.5-coder:14b"}`) —
 *     not wired up by this adapter yet, so "none" (nothing emitted/imported
 *     today; a future WP could add it cheaply since a real single-value
 *     surface does exist).
 *
 * Note on `platform`/`target` typing: `FileAction.platform`,
 * `DetectedPlatform.platform`, and `DriftItem.target` are all typed against
 * the legacy 8-member `TargetPlatform` union (claude-code/cursor/copilot/
 * codex/opencode/windsurf/gemini/junie) — pi was never a member of that
 * union (unlike opencode, which already existed as a legacy TargetPlatform).
 * Widening `TargetPlatform` to include "pi" would force exhaustive
 * `Record<TargetPlatform, ...>` maps in apps/desktop (e.g.
 * capability-catalog.ts's parity matrix) to add a "pi" entry too — out of
 * bounds per this WP ("never touch apps/*"). This adapter therefore
 * constructs its own FileAction/DetectResult/DriftItem values with `"pi"` as
 * the platform/target tag via a narrow, contained cast (see PI_PLATFORM
 * below) — every consumer of TargetPlatform outside this adapter (report.ts's
 * PLATFORM_ORDER.indexOf lookup, compile.ts's dispatch) already treats
 * unrecognized platform values leniently (indexOf returns -1, not a throw),
 * and this adapter's own exportConfig/detect/diff are never routed through
 * compile.ts's legacy groupTargetsByAdapter dispatch — they're invoked
 * standalone via getAdapter("pi"), exactly like the new opencode adapter.
 */
const PI_PLATFORM = "pi" as unknown as TargetPlatform;

const capabilities: AdapterCapabilities = {
  export: {
    instructions: "partial",
    skills: "full",
    subagents: "none",
    mcp: "none",
    permissions: "none",
    hooks: "none",
    model: "none",
  },
  import: {
    instructions: "full",
    skills: "none",
    subagents: "none",
    mcp: "none",
    permissions: "none",
    hooks: "none",
    model: "none",
  },
  diff: true,
  scopes: ["project"],
};

const PI_CONFIG_DIR = ".pi";
const APPEND_SYSTEM_PATH = `${PI_CONFIG_DIR}/APPEND_SYSTEM.md`;
const SKILLS_DIR = `${PI_CONFIG_DIR}/skills`;

/**
 * pi has no harness-kit-writable TargetPlatform slot in compile/targets.ts
 * (unlike opencode, pi was never a legacy TargetPlatform at all — it's
 * brand new this WP) — so compileSkills()/compileInstructions()'s per-target
 * dispatch tables don't know about it. Rather than adding "pi" as an eighth
 * legacy TargetPlatform (out of scope / would ripple through compile.ts,
 * targets.ts, detect-platforms.ts, apps/desktop's exhaustive parity catalog,
 * and every golden fixture), this adapter writes its own file actions
 * directly for the two domains it actually supports — instructions (single
 * bucket, via APPEND_SYSTEM.md) and skills (via SKILL.md files copied into
 * .pi/skills) — following the exact same marker-block/frontmatter-adaptation
 * conventions the shared services use so the output is indistinguishable in
 * spirit from what compileInstructions/compileSkills would produce if pi
 * were wired into their per-target maps.
 */
function buildOperationalContent(config: HarnessConfig, existing: string): string {
  const instructions = config.instructions;
  const harnessName = config.metadata?.name ?? "default";
  const slotContent = instructions?.operational;
  if (slotContent === null || slotContent === undefined) return existing;

  const importMode = instructions?.["import-mode"] ?? "merge";
  if (importMode === "skip") return existing;

  if (importMode === "replace") {
    return appendMarkerBlock("", harnessName, "operational", slotContent).trimStart() + "\n";
  }

  const existingBlock = findMarkerBlock(existing, harnessName, "operational");
  if (existingBlock) {
    return replaceMarkerBlock(existing, harnessName, "operational", slotContent);
  }
  if (existing.trim() === "") {
    return appendMarkerBlock("", harnessName, "operational", slotContent).trimStart() + "\n";
  }
  return appendMarkerBlock(existing, harnessName, "operational", slotContent);
}

function piFileAction(action: Omit<FileAction, "platform">): FileAction {
  return { ...action, platform: PI_PLATFORM };
}

async function exportConfig(config: HarnessConfig, ctx: AdapterContext): Promise<FilePlan> {
  const files: FileAction[] = [];
  const warnings: string[] = [];
  const skippedPlugins: string[] = [];

  // Instructions: pi's single operational-only bucket is APPEND_SYSTEM.md
  // (appended to pi's built-in default coding-assistant prompt — never a
  // full SYSTEM.md override, which would be destructive to pi's own default
  // behavior and is a stronger claim than harness-kit's "operational
  // instructions" concept warrants). No behavioral/identity slot exists for
  // pi at all — "partial", confirmed by the spike.
  const instructions = config.instructions;
  if (instructions?.operational !== undefined && instructions.operational !== null) {
    const importMode = instructions["import-mode"] ?? "merge";
    if (importMode !== "skip") {
      const fullPath = ctx.fs.joinPath(ctx.projectRoot, APPEND_SYSTEM_PATH);
      let existingContent = "";
      try {
        existingContent = await ctx.fs.readFile(fullPath);
      } catch {
        // File doesn't exist yet.
      }
      const newContent = buildOperationalContent(config, existingContent);
      files.push(
        piFileAction({
          path: APPEND_SYSTEM_PATH,
          content: newContent,
          action: existingContent ? "update" : "create",
          slot: "operational",
          linesAdded: instructions.operational.split("\n").length,
        }),
      );
    }

    if (instructions.behavioral || instructions.identity) {
      warnings.push(
        "pi: instructions.behavioral / instructions.identity have no pi equivalent (single operational-only bucket) — not exported.",
      );
    }
  }

  if (config.permissions) {
    warnings.push(
      "pi: permissions are not machine-enforceable (pi's --tools flag is a flat enable/disable list with no path/network/glob scoping) — not exported to any pi config surface.",
    );
  }

  // Skills: pi reads Agent-Skills (SKILL.md) from .pi/skills, same frontmatter
  // convention compileSkills() already adapts for every other target.
  const skillsResult = await compileSkillsForPi(config, ctx);
  files.push(...skillsResult.files);
  skippedPlugins.push(...skillsResult.skippedPlugins);

  return { files, warnings, skippedPlugins };
}

/**
 * Reuses compileSkills()'s plugin → SKILL.md resolution logic (manifest-first
 * resolution) but targets .pi/skills directly, since pi has no entry in
 * compile/skills.ts's SKILL_TARGET_DIR map (that map is keyed by the legacy
 * TargetPlatform union, which pi isn't a member of). Delegates to the same
 * shared discovery helpers compileSkills() uses (findSkillFiles/
 * computeSourceDir) rather than reimplementing resolution.
 */
async function compileSkillsForPi(
  config: HarnessConfig,
  ctx: AdapterContext,
): Promise<{ files: FileAction[]; skippedPlugins: string[] }> {
  const plugins = config.plugins;
  if (!plugins || plugins.length === 0) return { files: [], skippedPlugins: [] };

  const { findSkillFiles, computeSourceDir } = await import("../../compile/discovery.js");
  const home = ctx.homeRoot;
  const cwd = ctx.projectRoot;
  const files: FileAction[] = [];
  const skippedPlugins: string[] = [];

  for (const plugin of plugins) {
    let skillContent: string | null = null;

    if (plugin.skills && plugin.skills.length > 0) {
      for (const skill of plugin.skills) {
        const skillPath = skill.path.startsWith("/") ? skill.path : ctx.fs.joinPath(cwd, skill.path);
        if (await ctx.fs.exists(skillPath)) {
          skillContent = await ctx.fs.readFile(skillPath);
          break;
        }
      }
    }

    if (!skillContent) {
      const sourceDir = computeSourceDir(plugin.source, cwd, home, ctx.fs.joinPath.bind(ctx.fs));
      if (sourceDir !== null && (await ctx.fs.exists(sourceDir))) {
        const manifestPath = ctx.fs.joinPath(sourceDir, "plugin.json");
        if (await ctx.fs.exists(manifestPath)) {
          try {
            const raw = await ctx.fs.readFile(manifestPath);
            const manifest: { skills?: Array<{ name: string; path: string }> } = JSON.parse(raw);
            if (manifest.skills && manifest.skills.length > 0) {
              for (const skill of manifest.skills) {
                const skillPath = ctx.fs.joinPath(sourceDir, skill.path);
                if (await ctx.fs.exists(skillPath)) {
                  skillContent = await ctx.fs.readFile(skillPath);
                  break;
                }
              }
            }
          } catch {
            // Malformed plugin.json — fall through to walker.
          }
        }
        if (!skillContent) {
          const found = await findSkillFiles(sourceDir, ctx.fs);
          if (found.length > 0) skillContent = await ctx.fs.readFile(found[0]);
        }
      }
    }

    if (!skillContent) {
      skippedPlugins.push(
        `${plugin.name}: skipped (no SKILL.md found — checked inline declaration, source dir, and legacy paths)`,
      );
      continue;
    }

    const destPath = ctx.fs.joinPath(SKILLS_DIR, plugin.name, "SKILL.md");
    files.push(
      piFileAction({
        path: destPath,
        content: skillContent,
        action: "create",
        slot: "skills",
      }),
    );
  }

  return { files, skippedPlugins };
}

async function detect(ctx: AdapterContext): Promise<DetectResult | null> {
  const indicators: string[] = [];
  const piDir = ctx.fs.joinPath(ctx.projectRoot, PI_CONFIG_DIR);
  if (await ctx.fs.exists(piDir)) indicators.push(PI_CONFIG_DIR);

  if (indicators.length === 0) return null;
  return {
    platform: PI_PLATFORM,
    indicators,
    needsConfirmation: false,
  };
}

/**
 * Reverse-import: .pi/APPEND_SYSTEM.md (project-level) → opaque operational
 * instruction block. Global (~/.pi/agent/APPEND_SYSTEM.md) is intentionally
 * out of scope — every other adapter's importConfig only reads
 * project-relative files (ctx.projectRoot), never the user's home directory,
 * and pi's own project file takes precedence when both exist anyway (see
 * resource-loader.js's discoverAppendSystemPromptFile).
 */
async function importConfig(ctx: AdapterContext): Promise<ImportedFragment[]> {
  const block = await readInstructionFileAsOpaqueBlock(ctx.fs, APPEND_SYSTEM_PATH, "operational", "pi");
  if (block) {
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

  if (await ctx.fs.exists(ctx.fs.joinPath(ctx.projectRoot, APPEND_SYSTEM_PATH))) {
    return [
      {
        domain: "instructions",
        config: {},
        warnings: [],
        skipped: [
          {
            file: APPEND_SYSTEM_PATH,
            reason: "file exists but contains only harness-kit-generated marker blocks — nothing new to import.",
          },
        ],
      },
    ];
  }

  return [];
}

/**
 * Drift detection (WP-2.3): .pi/APPEND_SYSTEM.md's operational marker block
 * vs compiled output. detectInstructionDrift() is driven by
 * getSlotMappings(), which is keyed by the legacy TargetPlatform union pi
 * isn't part of — so this adapter classifies its own single file directly
 * via the same underlying primitive (classifyInstructionFile) rather than
 * detectInstructionDrift's per-TargetPlatform loop.
 */
async function diff(config: HarnessConfig, ctx: AdapterContext): Promise<DriftReport> {
  const instructions = config.instructions;
  if (!instructions || instructions.operational === null || instructions.operational === undefined) {
    return toDriftReport([]);
  }
  const importMode = instructions["import-mode"] ?? "merge";
  if (importMode === "skip") return toDriftReport([]);

  const { classifyInstructionFile } = await import("../../fix/detect.js");
  const harnessName = config.metadata?.name ?? "default";
  const items = await classifyInstructionFile(
    ctx.fs,
    APPEND_SYSTEM_PATH,
    harnessName,
    "operational",
    instructions.operational,
    "pi",
    PI_PLATFORM,
  );
  return toDriftReport(items);
}

export const piAdapter: HarnessAdapter = {
  id: "pi",
  capabilities,
  detect,
  exportConfig,
  importConfig,
  diff,
};
