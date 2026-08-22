import type { FsProvider } from "../fs-provider.js";
import type { AdapterId } from "../adapters/adapter.js";
import { findMarkerBlock } from "../compile/markers.js";
import type { OpaqueInstructionBlock } from "./types.js";

/**
 * Strip every harness-kit-generated marker block (`<!-- BEGIN harness:name:slot -->`
 * ... `<!-- END harness:name:slot -->`) out of a file's content, returning what's
 * left. Marker blocks are OUR OWN generated output, not user intent — importing
 * them back would be re-importing our own compile output, corrupting the
 * fixpoint. This must run before any opaque-block extraction.
 *
 * Also strips the (up to) one leading blank line left behind after removing a
 * block, to avoid opaque text ballooning with blank-line noise on repeated
 * import/compile/import cycles.
 */
const BEGIN_MARKER_RE = /^<!-- BEGIN harness:([^:]+):([^ ]+) -->$/;
const END_MARKER_RE = /^<!-- END harness:([^:]+):([^ ]+) -->$/;

/**
 * Line-based rather than one BEGIN...END regex on purpose. A regex pairing the
 * two tags has to lazily scan ahead for its END from every BEGIN it finds, so a
 * file of N unterminated BEGIN lines costs O(N^2) (CodeQL js/polynomial-redos)
 * — and instruction files are attacker-adjacent input during `harness import`.
 * Indexing the END lines up front makes each tag consumed at most once, so the
 * whole strip is linear. Matches the line-anchored convention already used by
 * compile/markers.ts and fix/detect.ts.
 */
export function stripHarnessMarkerBlocks(content: string): string {
  if (!content.includes("<!-- BEGIN harness:")) return content;

  const lines = content.split("\n");

  // tag -> ascending line indices where that END tag appears.
  const endLines = new Map<string, number[]>();
  for (let i = 0; i < lines.length; i++) {
    const end = END_MARKER_RE.exec(lines[i].trim());
    if (end) {
      const tag = `${end[1]}:${end[2]}`;
      const slots = endLines.get(tag);
      if (slots) slots.push(i);
      else endLines.set(tag, [i]);
    }
  }

  // Per-tag cursor into the arrays above. Cursors only advance, and every END
  // index is stepped over at most once across the whole loop, so this stays O(N).
  const cursors = new Map<string, number>();
  const kept: string[] = [];
  let droppedFinalLine = false;

  for (let i = 0; i < lines.length; i++) {
    const begin = BEGIN_MARKER_RE.exec(lines[i].trim());
    if (!begin) {
      kept.push(lines[i]);
      continue;
    }

    const tag = `${begin[1]}:${begin[2]}`;
    const candidates = endLines.get(tag);
    if (!candidates) {
      kept.push(lines[i]); // unterminated BEGIN — leave the line untouched
      continue;
    }

    let cursor = cursors.get(tag) ?? 0;
    while (cursor < candidates.length && candidates[cursor] <= i) cursor++;
    cursors.set(tag, cursor);

    if (cursor >= candidates.length) {
      kept.push(lines[i]); // no END left for this tag
      continue;
    }

    // Drop BEGIN..END inclusive; the END line's own newline goes with it.
    i = candidates[cursor];
    if (i === lines.length - 1) droppedFinalLine = true;
    cursors.set(tag, cursor + 1);
  }

  // A block running to EOF with no trailing newline still had a newline in front
  // of its BEGIN, which the old regex left behind. join() would swallow it, so
  // put the separator back rather than silently un-terminating the last line.
  if (droppedFinalLine && kept.length > 0) kept.push("");

  return kept.join("\n");
}

/**
 * Read an instruction file (CLAUDE.md, AGENT.md, SOUL.md, AGENTS.md, a cursor
 * .mdc rule, copilot-instructions.md, ...), strip harness-kit's own marker
 * blocks, and — if anything non-blank remains — wrap it as one opaque
 * instruction block with provenance. Returns null if the file doesn't exist
 * or contains nothing but harness-kit-generated content (nothing left to
 * import as "user" content).
 *
 * `stripFrontmatter`, when provided, removes a leading `---\n...\n---\n`
 * YAML frontmatter block (cursor .mdc files, copilot instructions files)
 * before opaque-block extraction — frontmatter is tooling metadata generated
 * by harness-kit's own compiler, not user prose.
 */
export async function readInstructionFileAsOpaqueBlock(
  fs: FsProvider,
  relPath: string,
  slot: OpaqueInstructionBlock["slot"],
  adapter: AdapterId,
  options: { stripFrontmatter?: boolean } = {},
): Promise<OpaqueInstructionBlock | null> {
  const fullPath = fs.joinPath(fs.cwd(), relPath);
  let raw: string;
  try {
    raw = await fs.readFile(fullPath);
  } catch {
    return null;
  }

  let content = raw;
  if (options.stripFrontmatter) {
    const fmMatch = content.match(/^---\n[\s\S]*?\n---\n?/);
    if (fmMatch) {
      content = content.slice(fmMatch[0].length);
    }
  }

  const stripped = stripHarnessMarkerBlocks(content);

  if (stripped.trim().length === 0) {
    return null;
  }

  return {
    slot,
    // Preserve verbatim text minus harness-kit's own generated blocks — never
    // trim/reformat beyond removing a single trailing newline for consistency
    // with how compile.ts writes files (content + "\n").
    text: stripped.replace(/\n+$/, "\n"),
    source: { adapter, file: relPath },
  };
}

/**
 * Detect whether a file's content is ENTIRELY one or more harness-kit marker
 * blocks (i.e. every non-blank line belongs to a marker block) — used to
 * decide whether a "skipped" entry should be recorded (nothing to import)
 * vs. an opaque block (real user content found).
 */
export function isEntirelyMarkerGenerated(content: string): boolean {
  return stripHarnessMarkerBlocks(content).trim().length === 0;
}

// Re-exported for callers that need direct access to the shared marker
// utilities without importing compile/markers.js redundantly.
export { findMarkerBlock };
