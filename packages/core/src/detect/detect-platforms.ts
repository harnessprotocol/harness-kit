import type { FsProvider } from "../fs-provider.js";
import type { DetectedPlatform, TargetPlatform } from "../types.js";
import { TARGETS } from "../compile/targets.js";

interface DetectionPaths {
  paths: string[];
  ambiguous: string[];
}

const DETECTION_PATHS: Partial<Record<TargetPlatform, DetectionPaths>> = {
  "claude-code": { paths: ["CLAUDE.md", ".claude", ".mcp.json"], ambiguous: [] },
  "cursor":      { paths: [".cursor", ".cursor/rules", ".cursor/mcp.json", ".cursor/skills"], ambiguous: [] },
  "copilot":     { paths: [".github/copilot-instructions.md", ".vscode/mcp.json", ".github/skills"], ambiguous: [".github"] },
  "codex":       { paths: [".codex"], ambiguous: [] },
  "opencode":    { paths: ["opencode.json", ".opencode"], ambiguous: [] },
  "windsurf":    { paths: [".windsurf"], ambiguous: [] },
  "gemini":      { paths: [".gemini"], ambiguous: [] },
  "junie":       { paths: [".junie"], ambiguous: [] },
};

export async function detectPlatforms(
  fs: FsProvider,
): Promise<DetectedPlatform[]> {
  const cwd = fs.cwd();
  const results: DetectedPlatform[] = [];

  for (const target of TARGETS) {
    const detection = DETECTION_PATHS[target.id];
    if (!detection) continue;

    const ambiguousSet = new Set(detection.ambiguous);
    const allPaths = [...detection.paths, ...detection.ambiguous];

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
        platform: target.id,
        indicators: allFound,
        needsConfirmation: foundIndicators.length === 0 && foundAmbiguous.length > 0,
      });
    }
  }

  return results;
}
