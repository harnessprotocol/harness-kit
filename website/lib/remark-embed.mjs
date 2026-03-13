import { visit } from 'unist-util-visit';
import fs from 'node:fs';
import path from 'node:path';
import { fromMarkdown } from 'mdast-util-from-markdown';

// Remark plugin that replaces @embed directives with file contents at build time.
//
// Usage in MDX:
//   {/* @embed plugins/research/skills/research/SKILL.md */}
//
// The directive is replaced with the parsed markdown AST of the referenced file.
// Paths are resolved relative to a configurable root (defaults to the repo root,
// determined by walking up from process.cwd() to find a .git directory).
export function remarkEmbed({ root } = {}) {
  return (tree, file) => {
    const resolvedRoot = root || findRepoRoot(process.cwd());

    // Collect nodes to replace (avoid mutating during traversal)
    const replacements = [];

    visit(tree, (node, index, parent) => {
      if (
        node.type !== 'mdxFlowExpression' &&
        node.type !== 'mdxTextExpression'
      ) {
        return;
      }

      const match = node.value?.match(
        /\/\*\s*@embed\s+(.+?)\s*\*\//
      );
      if (!match) return;

      const relativePath = match[1].trim();
      const absolutePath = path.resolve(resolvedRoot, relativePath);

      if (!fs.existsSync(absolutePath)) {
        console.warn(
          `[remark-embed] File not found: ${absolutePath} (referenced in ${file.path || 'unknown'})`
        );
        return;
      }

      let content;
      try {
        content = fs.readFileSync(absolutePath, 'utf-8');
      } catch (err) {
        console.warn(
          `[remark-embed] Could not read ${absolutePath}: ${err.message}`
        );
        return;
      }

      // Parse the markdown content into AST nodes
      const embeddedTree = fromMarkdown(content);

      replacements.push({ parent, index, nodes: embeddedTree.children });
    });

    // Apply replacements in reverse order to preserve indices
    for (let i = replacements.length - 1; i >= 0; i--) {
      const { parent, index, nodes } = replacements[i];
      parent.children.splice(index, 1, ...nodes);
    }
  };
}

/**
 * Walk up from startDir looking for a .git directory to find the repo root.
 * Falls back to startDir if no .git is found.
 */
function findRepoRoot(startDir) {
  let dir = startDir;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, '.git'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return startDir;
}

export default remarkEmbed;
