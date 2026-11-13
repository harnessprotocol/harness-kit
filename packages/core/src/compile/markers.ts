import type { OrphanedBlock } from "../types.js";

const BEGIN_RE = /^<!-- BEGIN harness:([^:]+):([^ ]+) -->$/;
const END_RE = /^<!-- END harness:([^:]+):([^ ]+) -->$/;

export function buildMarkerBlock(
  name: string,
  slot: string,
  content: string,
): string {
  const begin = `<!-- BEGIN harness:${name}:${slot} -->`;
  const end = `<!-- END harness:${name}:${slot} -->`;
  return `${begin}\n${content}\n${end}`;
}

export interface MarkerBlockLocation {
  startLine: number;
  endLine: number;
  content: string;
}

export function findMarkerBlock(
  fileContent: string,
  name: string,
  slot: string,
): MarkerBlockLocation | null {
  const lines = fileContent.split("\n");
  const beginTag = `<!-- BEGIN harness:${name}:${slot} -->`;
  const endTag = `<!-- END harness:${name}:${slot} -->`;

  let startLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === beginTag) {
      startLine = i;
    } else if (lines[i].trim() === endTag && startLine >= 0) {
      return {
        startLine,
        endLine: i,
        content: lines.slice(startLine + 1, i).join("\n"),
      };
    }
  }
  return null;
}

export interface SyncBlockLocation extends MarkerBlockLocation {
  slot: string;
}

/**
 * The first `harness:sync:<slot>` block in a file, whatever its slot, or null.
 * Cross-surface instruction copies write one; older copies used the source
 * file's basename as the slot, so the slot is not assumed.
 */
export function findAnySyncBlock(fileContent: string): SyncBlockLocation | null {
  const lines = fileContent.split("\n");
  const begin = /^<!-- BEGIN harness:sync:([^ ]+) -->$/;
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].trim().match(begin);
    if (!match) continue;
    const endTag = `<!-- END harness:sync:${match[1]} -->`;
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j].trim() === endTag) {
        return {
          slot: match[1],
          startLine: i,
          endLine: j,
          content: lines.slice(i + 1, j).join("\n"),
        };
      }
    }
  }
  return null;
}

const SYNC_MARKER_LINE = /^<!-- (?:BEGIN|END) harness:sync:[^ ]+ -->$/;

/**
 * The instruction text a file carries for cross-surface comparison and for
 * copying: the whole file with only the `harness:sync` BEGIN/END marker lines
 * removed. Text inside a block and text outside both count, so the user's own
 * prose is never invisible to a comparison or silently left out of a copy,
 * and a copy of a file that holds a block never nests markers.
 */
export function syncedInstructionsContent(fileContent: string): string {
  return fileContent
    .split("\n")
    .filter((line) => !SYNC_MARKER_LINE.test(line.trim()))
    .join("\n");
}

/** The file's text outside its first `harness:sync` block (the whole file when it has none). */
export function textOutsideSyncBlock(fileContent: string): string {
  const block = findAnySyncBlock(fileContent);
  if (!block) return fileContent;
  const lines = fileContent.split("\n");
  return [...lines.slice(0, block.startLine), ...lines.slice(block.endLine + 1)].join("\n");
}

export function replaceMarkerBlock(
  fileContent: string,
  name: string,
  slot: string,
  newContent: string,
): string {
  const beginTag = `<!-- BEGIN harness:${name}:${slot} -->`;
  const endTag = `<!-- END harness:${name}:${slot} -->`;
  const lines = fileContent.split("\n");

  let startLine = -1;
  let endLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === beginTag) {
      startLine = i;
    } else if (lines[i].trim() === endTag && startLine >= 0) {
      endLine = i;
      break;
    }
  }

  if (startLine < 0 || endLine < 0) return fileContent;

  const before = lines.slice(0, startLine);
  const after = lines.slice(endLine + 1);
  const block = buildMarkerBlock(name, slot, newContent);
  return [...before, block, ...after].join("\n");
}

export function appendMarkerBlock(
  fileContent: string,
  name: string,
  slot: string,
  content: string,
): string {
  const block = buildMarkerBlock(name, slot, content);
  const trimmed = fileContent.trimEnd();
  if (trimmed.length === 0) {
    return block + "\n";
  }
  return trimmed + "\n\n" + block + "\n";
}

export function findOrphanedMarkerBlocks(
  fileContent: string,
  currentName: string,
  filePath: string,
): OrphanedBlock[] {
  const lines = fileContent.split("\n");
  const orphans: OrphanedBlock[] = [];

  let inBlock = false;
  let blockName = "";
  let blockSlot = "";
  let blockStart = -1;
  const blockLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const beginMatch = lines[i].trim().match(BEGIN_RE);
    if (beginMatch && !inBlock) {
      inBlock = true;
      blockName = beginMatch[1];
      blockSlot = beginMatch[2];
      blockStart = i;
      blockLines.length = 0;
      continue;
    }

    const endMatch = lines[i].trim().match(END_RE);
    if (endMatch && inBlock && endMatch[1] === blockName && endMatch[2] === blockSlot) {
      if (blockName !== currentName) {
        orphans.push({
          name: blockName,
          slot: blockSlot,
          file: filePath,
          startLine: blockStart + 1, // 1-indexed
          endLine: i + 1, // 1-indexed
          content: blockLines.join("\n"),
        });
      }
      inBlock = false;
      continue;
    }

    if (inBlock) {
      blockLines.push(lines[i]);
    }
  }

  return orphans;
}

export function removeOrphanedBlocks(
  fileContent: string,
  orphans: OrphanedBlock[],
): string {
  const lines = fileContent.split("\n");
  // Collect line ranges to remove (convert 1-indexed to 0-indexed)
  const removeSet = new Set<number>();
  for (const orphan of orphans) {
    for (let i = orphan.startLine - 1; i <= orphan.endLine - 1; i++) {
      removeSet.add(i);
    }
    // Also remove a blank line immediately after the block if present
    const nextLine = orphan.endLine; // 0-indexed of line after endLine
    if (nextLine < lines.length && lines[nextLine].trim() === "") {
      removeSet.add(nextLine);
    }
  }

  const result = lines.filter((_, i) => !removeSet.has(i));
  return result.join("\n");
}
