import { useEffect, useState } from "react";
import { readClaudeMd } from "../../lib/tauri";

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
      <div style={{ marginBottom: "16px", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
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
        <div style={{
          flex: 1,
          borderRadius: "8px",
          border: "1px solid var(--border-base)",
          background: "var(--bg-surface)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}>
          <div style={{
            padding: "8px 14px",
            borderBottom: "1px solid var(--separator)",
            background: "var(--bg-elevated)",
          }}>
            <span style={{ fontSize: "11px", fontFamily: "ui-monospace, monospace", color: "var(--fg-subtle)" }}>
              {selectedPath}
            </span>
          </div>
          <pre style={{
            flex: 1,
            padding: "14px",
            margin: 0,
            fontFamily: "ui-monospace, monospace",
            fontSize: "12px",
            lineHeight: "1.6",
            color: "var(--fg-base)",
            overflowY: "auto",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}>
            {content}
          </pre>
        </div>
      )}
    </div>
  );
}
