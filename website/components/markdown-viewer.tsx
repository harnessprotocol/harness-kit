"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownViewerProps {
  content: string;
  filename?: string;
}

/**
 * Strip YAML frontmatter from markdown content for preview rendering.
 */
function stripFrontmatter(content: string): string {
  const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  return match ? content.slice(match[0].length) : content;
}

export function MarkdownViewer({ content, filename }: MarkdownViewerProps) {
  const [mode, setMode] = useState<"preview" | "raw">("preview");

  if (!content) return null;

  return (
    <div className="markdown-viewer">
      <div className="mv-toolbar">
        <span className="mv-filename">{filename}</span>
        <div className="mv-toggle">
          <button
            className={`mv-btn ${mode === "preview" ? "mv-btn-active" : ""}`}
            onClick={() => setMode("preview")}
          >
            Preview
          </button>
          <button
            className={`mv-btn ${mode === "raw" ? "mv-btn-active" : ""}`}
            onClick={() => setMode("raw")}
          >
            Raw
          </button>
        </div>
      </div>
      <div className="mv-content">
        {mode === "raw" ? (
          <pre className="mv-raw">
            <code>{content}</code>
          </pre>
        ) : (
          <div className="mv-preview">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{stripFrontmatter(content)}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
