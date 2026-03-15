import type { FsProvider } from "../fs-provider.js";
import type { DetectedPlatform, TargetPlatform } from "../types.js";

interface PlatformIndicator {
  platform: TargetPlatform;
  paths: string[];
  /** If this is the only indicator found, flag for user confirmation */
  ambiguousPaths: string[];
}

const INDICATORS: PlatformIndicator[] = [
  {
    platform: "claude-code",
    paths: ["CLAUDE.md", ".claude", ".mcp.json"],
    ambiguousPaths: [],
  },
  {
    platform: "cursor",
    paths: [".cursor", ".cursor/rules", ".cursor/mcp.json", ".cursor/skills"],
    ambiguousPaths: [],
  },
  {
    platform: "copilot",
    paths: [
      ".github/copilot-instructions.md",
      ".vscode/mcp.json",
      ".github/skills",
    ],
    ambiguousPaths: [".github"],
  },
];

export async function detectPlatforms(
  fs: FsProvider,
): Promise<DetectedPlatform[]> {
  const cwd = fs.cwd();
  const results: DetectedPlatform[] = [];

  for (const indicator of INDICATORS) {
    const foundIndicators: string[] = [];
    const foundAmbiguous: string[] = [];

    for (const p of indicator.paths) {
      const fullPath = fs.joinPath(cwd, p);
      if (await fs.exists(fullPath)) {
        foundIndicators.push(p);
      }
    }

    for (const p of indicator.ambiguousPaths) {
      const fullPath = fs.joinPath(cwd, p);
      if (await fs.exists(fullPath)) {
        foundAmbiguous.push(p);
      }
    }

    const allFound = [...foundIndicators, ...foundAmbiguous];
    if (allFound.length > 0) {
      // Only ambiguous paths found → needs confirmation
      const needsConfirmation =
        foundIndicators.length === 0 && foundAmbiguous.length > 0;

      results.push({
        platform: indicator.platform,
        indicators: allFound,
        needsConfirmation,
      });
    }
  }

  return results;
}
