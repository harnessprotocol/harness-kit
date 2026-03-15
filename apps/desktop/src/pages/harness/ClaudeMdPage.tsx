import { useEffect, useState } from "react";
import { readClaudeMd } from "../../lib/tauri";
import MarkdownPanel from "../../components/MarkdownPanel";

const CLAUDE_MD_PATHS = [
  { label: "Global", path: "~/.claude/CLAUDE.md" },
];

export default function ClaudeMdPage() {
  const [selectedPath, setSelectedPath] = useState(CLAUDE_MD_PATHS[0].path);
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    readClaudeMd(selectedPath)
      .then(setContent)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [selectedPath]);

  return (
    <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ marginBottom: "16px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexShrink: 0 }}>
        <div>
          <h1 style={{ fontSize: "17px", fontWeight: 600, letterSpacing: "-0.3px", color: "var(--fg-base)", margin: 0 }}>
            CLAUDE.md
          </h1>
          <p style={{ fontSize: "12px", color: "var(--fg-muted)", margin: "3px 0 0" }}>
            Your Claude Code instruction files.
          </p>
        </div>

        <select
          value={selectedPath}
          onChange={(e) => setSelectedPath(e.target.value)}
          style={{
            fontSize: "12px",
            borderRadius: "6px",
            padding: "4px 8px",
            background: "var(--bg-surface)",
            border: "1px solid var(--border-strong)",
            color: "var(--fg-base)",
            outline: "none",
            cursor: "pointer",
          }}
        >
          {CLAUDE_MD_PATHS.map((p) => (
            <option key={p.path} value={p.path}>{p.label}</option>
          ))}
        </select>
      </div>

      {loading && <p style={{ fontSize: "13px", color: "var(--fg-subtle)" }}>Loading…</p>}

      {error && (
        <div style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-base)",
          borderRadius: "8px",
          padding: "10px 14px",
          fontSize: "13px",
          color: "var(--danger)",
        }}>
          {error}
        </div>
      )}

      {!loading && !error && content !== null && (
        <MarkdownPanel content={content} fill defaultView="preview" />
      )}
    </div>
  );
}
