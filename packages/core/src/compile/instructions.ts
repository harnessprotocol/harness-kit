import type { FsProvider } from "../fs-provider.js";
import type {
  FileAction,
  HarnessConfig,
  HarnessInstructions,
  TargetPlatform,
} from "../types.js";
import {
  appendMarkerBlock,
  buildMarkerBlock,
  findMarkerBlock,
  replaceMarkerBlock,
} from "./markers.js";

// ── Slot → file mapping ─────────────────────────────────────

type InstructionSlot = "operational" | "behavioral" | "identity";

interface SlotMapping {
  slot: InstructionSlot;
  file: Record<TargetPlatform, string | null>;
}

const SLOT_MAPPINGS: SlotMapping[] = [
  {
    slot: "operational",
    file: {
      "claude-code": "CLAUDE.md",
      cursor: ".cursor/rules/harness.mdc",
      copilot: ".github/copilot-instructions.md",
    },
  },
  {
    slot: "behavioral",
    file: {
      "claude-code": "AGENT.md",
      cursor: ".cursor/rules/behavioral.mdc",
      copilot: ".github/instructions/behavioral.instructions.md",
    },
  },
  {
    slot: "identity",
    file: {
      "claude-code": "SOUL.md",
      cursor: null, // not supported
      copilot: null, // not supported
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
};

const COPILOT_FRONTMATTER = `---
applyTo: "**"
---`;

function buildFrontmatter(
  platform: TargetPlatform,
  slot: InstructionSlot,
): string | null {
  if (platform === "cursor" && slot in CURSOR_FRONTMATTER) {
    return CURSOR_FRONTMATTER[slot];
  }
  if (platform === "copilot") {
    return COPILOT_FRONTMATTER;
  }
  return null;
}

// ── Compile instructions ─────────────────────────────────────

export async function compileInstructions(
  config: HarnessConfig,
  targets: TargetPlatform[],
  fs: FsProvider,
): Promise<{ files: FileAction[]; warnings: string[] }> {
  const instructions = config.instructions;
  if (!instructions) {
    return { files: [], warnings: [] };
  }

  const importMode = instructions["import-mode"] ?? "merge";
  const harnessName = config.metadata?.name ?? "default";
  const cwd = fs.cwd();
  const files: FileAction[] = [];
  const warnings: string[] = [];

  if (importMode === "skip") {
    return { files, warnings };
  }

  for (const mapping of SLOT_MAPPINGS) {
    const slotContent = instructions[mapping.slot];
    if (slotContent === null || slotContent === undefined) {
      continue;
    }

    for (const target of targets) {
      const filePath = mapping.file[target];
      if (!filePath) continue; // slot not supported on this platform

      const fullPath = fs.joinPath(cwd, filePath);
      const frontmatter = buildFrontmatter(target, mapping.slot);

      if (importMode === "replace") {
        const markerBlock = buildMarkerBlock(harnessName, mapping.slot, slotContent);
        const fullContent = frontmatter
          ? `${frontmatter}\n\n${markerBlock}`
          : markerBlock;

        files.push({
          path: filePath,
          content: fullContent + "\n",
          action: "needs-confirmation",
          platform: target,
          slot: mapping.slot,
          linesAdded: fullContent.split("\n").length,
        });
        continue;
      }

      // merge mode — read directly, default to empty on missing file
      let existingContent = "";
      try {
        existingContent = await fs.readFile(fullPath);
      } catch {
        // File doesn't exist yet — start empty
      }

      const existing = findMarkerBlock(existingContent, harnessName, mapping.slot);
      let newFileContent: string;

      if (existing) {
        // Update existing marker block
        newFileContent = replaceMarkerBlock(
          existingContent,
          harnessName,
          mapping.slot,
          slotContent,
        );
      } else if (existingContent.trim() === "") {
        // New file — include frontmatter if needed
        const markerBlock = buildMarkerBlock(harnessName, mapping.slot, slotContent);
        newFileContent = frontmatter
          ? `${frontmatter}\n\n${markerBlock}\n`
          : `${markerBlock}\n`;
      } else {
        // Append to existing file
        newFileContent = appendMarkerBlock(
          existingContent,
          harnessName,
          mapping.slot,
          slotContent,
        );
      }

      const linesAdded = slotContent.split("\n").length;
      files.push({
        path: filePath,
        content: newFileContent,
        action: existing ? "update" : "create",
        platform: target,
        slot: mapping.slot,
        linesAdded,
      });
    }
  }

  return { files, warnings };
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
