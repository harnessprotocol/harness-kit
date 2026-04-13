import fs from "node:fs";
import path from "node:path";
import { visit } from "unist-util-visit";

// Remark plugin that replaces @embed directives with file contents at build time.
//
// Usage in MDX:
//   {/* @embed plugins/research/skills/research/SKILL.md */}
//
// The directive is replaced with a <MarkdownViewer> component that provides
// a Raw/Preview toggle for the embedded content. The component must be
// registered in mdxComponents.
export function remarkEmbed({ root } = {}) {
  return (tree, file) => {
    const resolvedRoot = root || findRepoRoot(process.cwd());

    // Collect nodes to replace (avoid mutating during traversal)
    const replacements = [];

    visit(tree, (node, index, parent) => {
      if (node.type !== "mdxFlowExpression" && node.type !== "mdxTextExpression") {
        return;
      }

      const match = node.value?.match(/\/\*\s*@embed\s+(.+?)\s*\*\//);
      if (!match) return;

      const relativePath = match[1].trim();
      const absolutePath = path.resolve(resolvedRoot, relativePath);

      if (!fs.existsSync(absolutePath)) {
        console.warn(
          `[remark-embed] File not found: ${absolutePath} (referenced in ${file.path || "unknown"})`,
        );
        return;
      }

      let content;
      try {
        content = fs.readFileSync(absolutePath, "utf-8");
      } catch (err) {
        console.warn(`[remark-embed] Could not read ${absolutePath}: ${err.message}`);
        return;
      }

      const filename = path.basename(absolutePath);

      // Build a JSX expression attribute with proper ESTree AST
      // so the MDX compiler can serialize the string literal
      const escapedContent = JSON.stringify(content);

      const jsxNode = {
        type: "mdxJsxFlowElement",
        name: "MarkdownViewer",
        attributes: [
          {
            type: "mdxJsxAttribute",
            name: "content",
            value: {
              type: "mdxJsxAttributeValueExpression",
              value: escapedContent,
              data: {
                estree: {
                  type: "Program",
                  sourceType: "module",
                  body: [
                    {
                      type: "ExpressionStatement",
                      expression: {
                        type: "Literal",
                        value: content,
                        raw: escapedContent,
                      },
                    },
                  ],
                },
              },
            },
          },
          {
            type: "mdxJsxAttribute",
            name: "filename",
            value: filename,
          },
        ],
        children: [],
      };

      replacements.push({ parent, index, nodes: [jsxNode] });
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
    if (fs.existsSync(path.join(dir, ".git"))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return startDir;
}

export default remarkEmbed;
