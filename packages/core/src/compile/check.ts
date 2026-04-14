import { createHash } from "node:crypto";
import type { FsProvider } from "../fs-provider.js";
import type { HarnessConfig, TargetPlatform } from "../types.js";
import { findMarkerBlock } from "./markers.js";
import { compileSkills } from "./skills.js";
import { TARGETS } from "./targets.js";

// ── Low-level utilities ──────────────────────────────────────

export function computeFileHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Extract the content inside a harness marker block from a deployed file.
 * Returns null if the block is absent.
 */
export function extractMarkerContent(
  fileContent: string,
  harnessName: string,
  slot: string,
): string | null {
  const block = findMarkerBlock(fileContent, harnessName, slot);
  return block ? block.content : null;
}

/**
 * Check whether the instruction marker block in a deployed file matches
 * the expected content from harness.yaml.
 */
export async function instructionDrift(
  expectedSlotContent: string,
  deployedPath: string,
  harnessName: string,
  slot: string,
  fs: FsProvider,
): Promise<"ok" | "drift" | "missing"> {
  let fileContent: string;
  try {
    fileContent = await fs.readFile(deployedPath);
  } catch {
    return "missing";
  }

  const deployed = extractMarkerContent(fileContent, harnessName, slot);
  if (deployed === null) return "missing";
  return deployed.trim() === expectedSlotContent.trim() ? "ok" : "drift";
}

/**
 * SHA256-based directory signature. Deterministic: same tree always produces
 * the same hash. Format per entry:
 *   "f:relative/path:sha256hex" for files
 *   "d:relative/path" for directories
 * Entries are sorted lexicographically before hashing.
 */
export async function directorySignature(
  rootDir: string,
  fs: FsProvider,
  maxDepth = 8,
): Promise<string> {
  const records: string[] = [];
  await collectRecords(rootDir, rootDir, fs, records, 0, maxDepth);
  records.sort();
  return createHash("sha256").update(records.join("\n")).digest("hex");
}

async function collectRecords(
  rootDir: string,
  dir: string,
  fs: FsProvider,
  records: string[],
  depth: number,
  maxDepth: number,
): Promise<void> {
  if (depth > maxDepth) return;

  let entries: string[];
  try {
    entries = await fs.readDir(dir);
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = fs.joinPath(dir, entry);
    // Build relative path: strip root prefix + leading separator
    const relPath = fullPath.slice(rootDir.length).replace(/^\//, "");

    if (await fs.isDirectory(fullPath)) {
      records.push(`d:${relPath}`);
      await collectRecords(rootDir, fullPath, fs, records, depth + 1, maxDepth);
    } else {
      const content = await fs.readFile(fullPath);
      const hash = computeFileHash(content);
      records.push(`f:${relPath}:${hash}`);
    }
  }
}

export async function directoriesEqual(
  source: string,
  deployed: string,
  fs: FsProvider,
): Promise<boolean> {
  const [sigA, sigB] = await Promise.all([
    directorySignature(source, fs),
    directorySignature(deployed, fs),
  ]);
  return sigA === sigB;
}

// ── Check result types ───────────────────────────────────────

export interface CheckEntry {
  kind: "skill" | "instruction";
  name: string;          // plugin name for skills; slot name for instructions
  target: TargetPlatform;
  path: string;
  status: "ok" | "drift" | "missing";
}

export interface CheckResult {
  entries: CheckEntry[];
  hasDrift: boolean;
}

// ── High-level check ─────────────────────────────────────────

/**
 * Compare compiled output against what's currently on disk.
 * Read-only — never writes files.
 */
export async function checkCompiled(
  config: HarnessConfig,
  targets: TargetPlatform[],
  fs: FsProvider,
): Promise<CheckResult> {
  const entries: CheckEntry[] = [];
  const cwd = fs.cwd();
  const harnessName = config.metadata?.name ?? "default";

  // ── Skill checks ─────────────────────────────────────────
  const { files: skillFiles } = await compileSkills(config, targets, fs);

  for (const file of skillFiles) {
    const deployedPath = fs.joinPath(cwd, file.path);
    let deployedContent: string;
    try {
      deployedContent = await fs.readFile(deployedPath);
    } catch {
      entries.push({
        kind: "skill",
        name: file.path.split("/").at(-2) ?? file.path,
        target: file.platform,
        path: file.path,
        status: "missing",
      });
      continue;
    }

    const status =
      computeFileHash(deployedContent) === computeFileHash(file.content)
        ? "ok"
        : "drift";

    entries.push({
      kind: "skill",
      name: file.path.split("/").at(-2) ?? file.path,
      target: file.platform,
      path: file.path,
      status,
    });
  }

  // ── Instruction checks ───────────────────────────────────
  const instructions = config.instructions;
  if (instructions) {
    const slots = ["operational", "behavioral", "identity"] as const;

    // Instruction file mapping per target (mirrors instructions.ts SLOT_MAPPINGS)
    const instructionFiles: Record<
      string,
      Partial<Record<TargetPlatform, string>>
    > = {
      operational: {
        "claude-code": "CLAUDE.md",
        cursor: ".cursor/rules/harness.mdc",
        copilot: ".github/copilot-instructions.md",
        codex: "AGENTS.md",
        opencode: "AGENTS.md",
        windsurf: "AGENTS.md",
        gemini: "AGENTS.md",
        junie: "AGENTS.md",
      },
      behavioral: {
        "claude-code": "AGENT.md",
        cursor: ".cursor/rules/behavioral.mdc",
        copilot: ".github/instructions/behavioral.instructions.md",
      },
      identity: {
        "claude-code": "SOUL.md",
      },
    };

    for (const slot of slots) {
      const slotContent = instructions[slot];
      if (!slotContent) continue;

      const fileMap = instructionFiles[slot];
      const seenPaths = new Set<string>();

      for (const target of targets) {
        const filePath = fileMap[target];
        if (!filePath) continue;
        if (seenPaths.has(filePath)) continue;
        seenPaths.add(filePath);

        // For AGENTS.md targets, label as the first matching target
        const labelTarget = target;
        const deployedPath = fs.joinPath(cwd, filePath);
        const status = await instructionDrift(
          slotContent,
          deployedPath,
          harnessName,
          slot,
          fs,
        );

        entries.push({
          kind: "instruction",
          name: slot,
          target: labelTarget,
          path: filePath,
          status,
        });
      }
    }
  }

  const hasDrift = entries.some(
    (e) => e.status === "drift" || e.status === "missing",
  );

  // Sort: instructions first, then skills; within each kind, by target then name
  entries.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "instruction" ? -1 : 1;
    if (a.target !== b.target) return a.target.localeCompare(b.target);
    return a.name.localeCompare(b.name);
  });

  return { entries, hasDrift };
}

/** All targets that have at least one instruction or skill dir to check. */
export function getCheckableTargets(): TargetPlatform[] {
  return TARGETS.map((t) => t.id);
}
