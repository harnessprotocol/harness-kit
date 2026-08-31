import type { FsProvider } from "../fs-provider.js";
import type {
  FileAction,
  HarnessConfig,
  SurfaceId,
} from "../types.js";
import {
  appendMarkerBlock,
  buildMarkerBlock,
  findMarkerBlock,
  replaceMarkerBlock,
} from "./markers.js";
import { renderArchitecturalConstraints } from "./architectural-constraints.js";

// ── Slot → file mapping ─────────────────────────────────────

type InstructionSlot = "operational" | "behavioral" | "identity";

/**
 * `architectural-constraints` (HEP-3) compiles into its own marker block rather
 * than any instruction slot, so it never collides with a user's
 * instructions.operational. It rides the operational slot's FILE map because
 * that is the only mapping present on every target — see
 * architectural-constraints.ts for why that matters.
 */
const CONSTRAINTS_SLOT = "constraints";

interface SlotMapping {
  slot: InstructionSlot;
  /** Partial over SurfaceId: surfaces without compile machinery yet have no entry. */
  file: Partial<Record<SurfaceId, string | null>>;
}

// Codex, OpenCode, Windsurf, Gemini, and Junie all share AGENTS.md for operational
// instructions. The compile loop deduplicates by output path — the last write wins,
// but all produce identical content so it is safe. A proper group-by-file
// deduplication pass is handled in compileInstructions().
const SLOT_MAPPINGS: SlotMapping[] = [
  {
    slot: "operational",
    file: {
      "claude-code": "CLAUDE.md",
      cursor: ".cursor/rules/harness.mdc",
      "copilot-vscode": ".github/copilot-instructions.md",
      codex: "AGENTS.md",
      opencode: "AGENTS.md",
      windsurf: "AGENTS.md",
      gemini: "AGENTS.md",
      junie: "AGENTS.md",
    },
  },
  {
    slot: "behavioral",
    file: {
      "claude-code": "AGENT.md",
      cursor: ".cursor/rules/behavioral.mdc",
      "copilot-vscode": ".github/instructions/behavioral.instructions.md",
      codex: null,
      opencode: null,
      windsurf: null,
      gemini: null,
      junie: null,
    },
  },
  {
    slot: "identity",
    file: {
      "claude-code": "SOUL.md",
      cursor: null,
      "copilot-vscode": null,
      codex: null,
      opencode: null,
      windsurf: null,
      gemini: null,
      junie: null,
    },
  },
];

// ── Platform-specific frontmatter ────────────────────────────

const CURSOR_FRONTMATTER: Record<string, string> = {
  operational: `---
description: Harness operational instructions
globs: "**/*"
alwaysApply: true
---`,
  behavioral: `---
description: Harness behavioral preferences
globs: "**/*"
alwaysApply: true
---`,
  // The constraints block shares cursor's operational .mdc. It still needs its
  // own entry for the case where architectural-constraints is the ONLY block in
  // the file — an .mdc without frontmatter is not loaded as a rule.
  constraints: `---
description: Harness architectural constraints
globs: "**/*"
alwaysApply: true
---`,
};

const COPILOT_FRONTMATTER = `---
applyTo: "**"
---`;

// `slot` is a plain string, not InstructionSlot: the constraints block is not an
// instruction slot but still needs cursor frontmatter when it stands alone.
function buildFrontmatter(
  platform: SurfaceId,
  slot: string,
): string | null {
  if (platform === "cursor" && slot in CURSOR_FRONTMATTER) {
    return CURSOR_FRONTMATTER[slot];
  }
  if (platform === "copilot-vscode") {
    return COPILOT_FRONTMATTER;
  }
  return null;
}

// ── Compile instructions ─────────────────────────────────────

export async function compileInstructions(
  config: HarnessConfig,
  targets: SurfaceId[],
  fs: FsProvider,
): Promise<{ files: FileAction[]; warnings: string[] }> {
  const instructions = config.instructions;
  const constraintsContent = renderArchitecturalConstraints(
    config["architectural-constraints"],
  );

  if (!instructions && !constraintsContent) {
    return { files: [], warnings: [] };
  }

  // import-mode lives under `instructions`, but it governs whether we touch the
  // user's instruction files at all — and the constraints block lands in those
  // same files — so `skip` suppresses both.
  const importMode = instructions?.["import-mode"] ?? "merge";
  const harnessName = config.metadata?.name ?? "default";
  const cwd = fs.cwd();
  const files: FileAction[] = [];
  const warnings: string[] = [];

  if (importMode === "skip") {
    return { files, warnings };
  }

  const operationalFiles = SLOT_MAPPINGS.find((m) => m.slot === "operational")!.file;

  // Order matters. `constraints` shares the operational FILE, and the writer
  // deduplicates by path with last-write-wins, so the operational block must be
  // emitted AFTER the constraints block: its FileAction carries the fully
  // accumulated file, and it is also the one each adapter's
  // appendPermissionsToInstructions() mutates (it matches on slot ===
  // "operational"). Emitting constraints last would silently drop permissions.
  const blocks: Array<{ slot: string; content: string; file: SlotMapping["file"] }> = [];

  if (constraintsContent) {
    blocks.push({
      slot: CONSTRAINTS_SLOT,
      content: constraintsContent,
      file: operationalFiles,
    });
  }

  for (const mapping of SLOT_MAPPINGS) {
    const slotContent = instructions?.[mapping.slot];
    if (slotContent === null || slotContent === undefined) continue;
    blocks.push({ slot: mapping.slot, content: slotContent, file: mapping.file });
  }

  // Accumulated content per output path. Two blocks landing in the same file
  // must build on each other rather than each re-reading the untouched file on
  // disk and clobbering the other.
  const pending = new Map<string, string>();

  for (const block of blocks) {
    // Deduplicate by output path within a block: several targets share a file
    // (AGENTS.md serves codex/opencode/windsurf/gemini/junie), and they produce
    // identical content, so the first target wins.
    const seenPaths = new Set<string>();

    for (const target of targets) {
      const filePath = block.file[target];
      if (!filePath) continue; // slot not supported on this platform
      if (seenPaths.has(filePath)) continue;
      seenPaths.add(filePath);

      const fullPath = fs.joinPath(cwd, filePath);
      const frontmatter = buildFrontmatter(target, block.slot);

      if (importMode === "replace") {
        let base = pending.get(filePath);
        if (base === undefined) {
          const markerBlock = buildMarkerBlock(harnessName, block.slot, block.content);
          base = frontmatter ? `${frontmatter}\n\n${markerBlock}` : markerBlock;
        } else {
          base = appendMarkerBlock(base, harnessName, block.slot, block.content);
        }
        pending.set(filePath, base);

        files.push({
          path: filePath,
          content: base + "\n",
          action: "needs-confirmation",
          platform: target,
          slot: block.slot,
          linesAdded: base.split("\n").length,
        });
        continue;
      }

      // merge mode — read from disk the first time this path is touched
      let existingContent = pending.get(filePath);
      if (existingContent === undefined) {
        try {
          existingContent = await fs.readFile(fullPath);
        } catch {
          existingContent = ""; // File doesn't exist yet — start empty
        }
      }

      const existing = findMarkerBlock(existingContent, harnessName, block.slot);
      let newFileContent: string;

      if (existing) {
        // Update existing marker block
        newFileContent = replaceMarkerBlock(
          existingContent,
          harnessName,
          block.slot,
          block.content,
        );
      } else if (existingContent.trim() === "") {
        // New file — include frontmatter if needed
        const markerBlock = buildMarkerBlock(harnessName, block.slot, block.content);
        newFileContent = frontmatter
          ? `${frontmatter}\n\n${markerBlock}\n`
          : `${markerBlock}\n`;
      } else {
        // Append to existing file
        newFileContent = appendMarkerBlock(
          existingContent,
          harnessName,
          block.slot,
          block.content,
        );
      }

      pending.set(filePath, newFileContent);

      const linesAdded = block.content.split("\n").length;
      files.push({
        path: filePath,
        content: newFileContent,
        action: existing ? "update" : "create",
        platform: target,
        slot: block.slot,
        linesAdded,
      });
    }
  }

  return { files, warnings };
}

/** The slot → platform → file mapping. Used by check.ts to avoid duplication. */
export function getSlotMappings(): Array<{ slot: string; file: Partial<Record<SurfaceId, string | null>> }> {
  return SLOT_MAPPINGS;
}

/** All instruction file paths across all platforms (for --clean scanning). */
export function getAllInstructionFilePaths(): string[] {
  const paths: string[] = [];
  for (const mapping of SLOT_MAPPINGS) {
    for (const filePath of Object.values(mapping.file)) {
      if (filePath) paths.push(filePath);
    }
  }
  return paths;
}
