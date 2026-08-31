import type { FsProvider } from "../fs-provider.js";
import type { DetectedPlatform, SurfaceId } from "../types.js";
import { TARGETS } from "../compile/targets.js";

interface DetectionPaths {
  paths: string[];
  ambiguous: string[];
}

// AGENTS.md is a shared open convention (read natively by Cursor, Copilot,
// Codex, OpenCode, Windsurf, Gemini CLI, and Junie) — its presence alone
// doesn't tell you which of those tools is actually in use, so it's listed
// as an *ambiguous* indicator for each rather than a confident one. A
// project with AGENTS.md but no tool-specific directory surfaces as
// needsConfirmation instead of a silent miss.
const AGENTS_MD = "AGENTS.md";

const DETECTION_PATHS: Partial<Record<SurfaceId, DetectionPaths>> = {
  "claude-code": { paths: ["CLAUDE.md", ".claude", ".mcp.json"], ambiguous: [] },
  "cursor":      { paths: [".cursor", ".cursor/rules", ".cursor/mcp.json", ".cursor/skills"], ambiguous: [AGENTS_MD] },
  "copilot-vscode": { paths: [".github/copilot-instructions.md", ".vscode/mcp.json", ".github/skills"], ambiguous: [".github", AGENTS_MD] },
  "codex":       { paths: [".codex"], ambiguous: [AGENTS_MD] },
  "opencode":    { paths: ["opencode.json", ".opencode"], ambiguous: [AGENTS_MD] },
  "windsurf":    { paths: [".windsurf"], ambiguous: [AGENTS_MD] },
  "gemini":      { paths: [".gemini"], ambiguous: [AGENTS_MD] },
  "junie":       { paths: [".junie"], ambiguous: [AGENTS_MD] },
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
