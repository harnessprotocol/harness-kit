import type { OrphanedBlock } from "../types.js";

const BEGIN_RE = /^<!-- BEGIN harness:([^:]+):([^ ]+) -->$/;
const END_RE = /^<!-- END harness:([^:]+):([^ ]+) -->$/;

export function buildMarkerBlock(name: string, slot: string, content: string): string {
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

export function removeOrphanedBlocks(fileContent: string, orphans: OrphanedBlock[]): string {
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
