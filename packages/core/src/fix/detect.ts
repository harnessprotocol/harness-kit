import type { FsProvider } from "../fs-provider.js";
import type { AdapterId } from "../adapters/adapter.js";
import type { HarnessConfig, TargetPlatform } from "../types.js";
import { findMarkerBlock, findOrphanedMarkerBlocks } from "../compile/markers.js";
import { getSlotMappings } from "../compile/instructions.js";
import type { DriftClass, DriftItem, DriftReport } from "./types.js";

/**
 * Classify one instruction file's drift for a single (target, slot) pair.
 *
 * Reuses the exact same marker primitives compile/check.ts already uses
 * (`findMarkerBlock`) so detection never diverges from what compile()
 * considers "the marker block". Splits the file into:
 *   - the marker region (compared against expected content from harness.yaml)
 *   - everything else ("outside" content)
 *
 * Returns null when there is nothing to report for this (target, slot) —
 * i.e. harness.yaml has no content for the slot on this target at all (the
 * file mapping doesn't apply), which mirrors compileInstructions()'s own
 * "slot not supported on this platform" skip.
 */
export async function classifyInstructionFile(
  fs: FsProvider,
  filePath: string,
  harnessName: string,
  slot: string,
  expectedContent: string,
  adapter: AdapterId,
  target: TargetPlatform,
): Promise<DriftItem[]> {
  const cwd = fs.cwd();
  const fullPath = fs.joinPath(cwd, filePath);

  let fileContent: string | null;
  try {
    fileContent = await fs.readFile(fullPath);
  } catch {
    fileContent = null;
  }

  if (fileContent === null) {
    return [
      {
        class: "missing",
        path: filePath,
        adapter,
        target,
        harnessName,
        slot,
        expectedContent,
        detail: `${filePath}: expected file is absent (slot '${slot}' has content in harness.yaml).`,
      },
    ];
  }

  const items: DriftItem[] = [];
  const block = findMarkerBlock(fileContent, harnessName, slot);

  if (block === null) {
    // File exists but the marker block for this slot is absent — same
    // "missing" classification check.ts uses (extractMarkerContent === null).
    items.push({
      class: "missing",
      path: filePath,
      adapter,
      target,
      harnessName,
      slot,
      expectedContent,
      detail: `${filePath}: marker block harness:${harnessName}:${slot} is absent.`,
    });
  } else if (block.content.trim() !== expectedContent.trim()) {
    items.push({
      class: "modified-inside-markers",
      path: filePath,
      adapter,
      target,
      harnessName,
      slot,
      expectedContent,
      detail: `${filePath}: content inside marker block harness:${harnessName}:${slot} diverges from compiled output.`,
    });
  }

  // Out-of-marker content check: only meaningful when the file exists.
  // "Outside" = everything except the lines belonging to marker blocks for
  // ANY harness name/slot (not just this one) — a file may contain several
  // harness-managed blocks plus user prose interleaved.
  const outside = stripAllMarkerBlocks(fileContent);
  if (outside.trim().length > 0) {
    // We cannot know what the "expected" outside content was without a
    // previous snapshot — outside content is the user's, full stop. Its
    // mere presence is not drift; classification only fires when we have
    // independent evidence something changed. Since core has no snapshot of
    // prior state, we treat ANY non-empty outside content as belonging to
    // the user and surface it for visibility (not automatically "drift" —
    // review-only, see buildFixPlan which never includes these).
    items.push({
      class: "user-modified-outside",
      path: filePath,
      adapter,
      target,
      harnessName,
      slot,
      detail: `${filePath}: contains user-authored content outside harness marker blocks — never auto-touched.`,
    });
  }

  // Orphaned blocks: marker blocks present under a DIFFERENT harness name
  // than the current config's. findOrphanedMarkerBlocks already does this
  // exact comparison (used by --clean) — reuse it verbatim.
  const orphans = findOrphanedMarkerBlocks(fileContent, harnessName, filePath);
  for (const orphan of orphans) {
    items.push({
      class: "orphaned",
      path: filePath,
      adapter,
      target,
      harnessName: orphan.name,
      slot: orphan.slot,
      detail: `${filePath}: marker block harness:${orphan.name}:${orphan.slot} has no corresponding slot in the current harness.yaml.`,
    });
  }

  return items;
}

/**
 * Strip every harness marker block (any name/slot) from file content,
 * returning what remains. Used to detect out-of-marker user content without
 * needing to know every possible harness name in advance.
 */
export function stripAllMarkerBlocks(fileContent: string): string {
  const lines = fileContent.split("\n");
  const BEGIN_RE = /^<!-- BEGIN harness:([^:]+):([^ ]+) -->$/;
  const END_RE = /^<!-- END harness:([^:]+):([^ ]+) -->$/;

  const keep: string[] = [];
  let inBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!inBlock && BEGIN_RE.test(trimmed)) {
      inBlock = true;
      continue;
    }
    if (inBlock && END_RE.test(trimmed)) {
      inBlock = false;
      continue;
    }
    if (!inBlock) {
      keep.push(line);
    }
  }

  return keep.join("\n");
}

/**
 * Drift-check every instruction slot mapping applicable to a set of legacy
 * targets, for a given harness.yaml config. Shared by every adapter's
 * diff() implementation so detection logic is written exactly once.
 */
export async function detectInstructionDrift(
  fs: FsProvider,
  config: HarnessConfig,
  targets: TargetPlatform[],
  adapter: AdapterId,
): Promise<DriftItem[]> {
  const instructions = config.instructions;
  if (!instructions) return [];

  const importMode = instructions["import-mode"] ?? "merge";
  if (importMode === "skip") return [];

  const harnessName = config.metadata?.name ?? "default";
  const items: DriftItem[] = [];

  for (const mapping of getSlotMappings()) {
    const slotContent = instructions[mapping.slot as keyof typeof instructions];
    if (typeof slotContent !== "string" || slotContent.length === 0) continue;

    const seenPaths = new Set<string>();

    for (const target of targets) {
      const filePath = mapping.file[target];
      if (!filePath) continue;
      if (seenPaths.has(filePath)) continue;
      seenPaths.add(filePath);

      const found = await classifyInstructionFile(
        fs,
        filePath,
        harnessName,
        mapping.slot,
        slotContent,
        adapter,
        target,
      );
      items.push(...found);
    }
  }

  return items;
}

/**
 * Wrap a flat DriftItem list into the DriftReport shape every adapter's
 * diff() returns. Shared here so each adapter doesn't hand-roll the same
 * grouping/hasDrift logic.
 */
export function toDriftReport(items: DriftItem[]): DriftReport {
  const byClass: Record<DriftClass, DriftItem[]> = {
    missing: [],
    "modified-inside-markers": [],
    "user-modified-outside": [],
    orphaned: [],
  };
  for (const item of items) {
    byClass[item.class].push(item);
  }
  const hasDrift = items.some(
    (i) => i.class === "missing" || i.class === "modified-inside-markers" || i.class === "orphaned",
  );
  return { items, hasDrift, byClass };
}
