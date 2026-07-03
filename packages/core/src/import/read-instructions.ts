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
const MARKER_BLOCK_RE = /<!-- BEGIN harness:([^:]+):([^ ]+) -->\n[\s\S]*?<!-- END harness:\1:\2 -->\n?/g;

export function stripHarnessMarkerBlocks(content: string): string {
  return content.replace(MARKER_BLOCK_RE, "");
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
