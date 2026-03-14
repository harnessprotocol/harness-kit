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
    <div className="p-6 flex flex-col h-full">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight" style={{ color: "var(--fg-base)" }}>
            CLAUDE.md
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--fg-muted)" }}>
            Your Claude Code instruction files.
          </p>
        </div>

        <select
          value={selectedPath}
          onChange={(e) => setSelectedPath(e.target.value)}
          className="text-sm rounded px-2 py-1"
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-base)",
            color: "var(--fg-base)",
          }}
        >
          {CLAUDE_MD_PATHS.map((p) => (
            <option key={p.path} value={p.path}>{p.label}</option>
          ))}
        </select>
      </div>

      {loading && (
        <p className="text-sm" style={{ color: "var(--fg-subtle)" }}>Loading…</p>
      )}

      {error && (
        <div
          className="rounded-lg p-4 text-sm"
          style={{ background: "var(--bg-surface)", border: "1px solid var(--border-base)", color: "var(--danger)" }}
        >
          {error}
        </div>
      )}

      {!loading && !error && content !== null && (
        <div
          className="flex-1 rounded-lg p-4 overflow-y-auto"
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-base)",
          }}
        >
          <pre
            className="text-xs whitespace-pre-wrap"
            style={{ fontFamily: "monospace", color: "var(--fg-base)", margin: 0 }}
          >
            {content}
          </pre>
        </div>
      )}
    </div>
  );
}
