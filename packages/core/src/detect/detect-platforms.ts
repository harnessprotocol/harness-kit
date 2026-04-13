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
    paths: [".github/copilot-instructions.md", ".vscode/mcp.json", ".github/skills"],
    ambiguousPaths: [".github"],
  },
];

export async function detectPlatforms(fs: FsProvider): Promise<DetectedPlatform[]> {
  const cwd = fs.cwd();
  const results: DetectedPlatform[] = [];

  for (const indicator of INDICATORS) {
    const allPaths = [...indicator.paths, ...indicator.ambiguousPaths];
    const ambiguousSet = new Set(indicator.ambiguousPaths);

    // Check all paths for this platform in parallel
    const checks = await Promise.all(
      allPaths.map(async (p) => ({
        path: p,
        exists: await fs.exists(fs.joinPath(cwd, p)),
        ambiguous: ambiguousSet.has(p),
      })),
    );

    const foundIndicators = checks.filter((c) => c.exists && !c.ambiguous).map((c) => c.path);
    const foundAmbiguous = checks.filter((c) => c.exists && c.ambiguous).map((c) => c.path);
    const allFound = [...foundIndicators, ...foundAmbiguous];

    if (allFound.length > 0) {
      results.push({
        platform: indicator.platform,
        indicators: allFound,
        needsConfirmation: foundIndicators.length === 0 && foundAmbiguous.length > 0,
      });
    }
  }

  return results;
}
