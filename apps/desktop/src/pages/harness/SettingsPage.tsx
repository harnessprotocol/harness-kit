import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listClaudeDir } from "../../lib/tauri";

const TEXT_EXTENSIONS = new Set([".md", ".json", ".yaml", ".yml", ".sh", ".txt", ".toml", ".mjs"]);

function extOf(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx === -1 ? "" : name.slice(idx);
}

const EXT_LABEL: Record<string, string> = {
  ".md": "Markdown",
  ".json": "JSON",
  ".yaml": "YAML",
  ".yml": "YAML",
  ".sh": "Shell",
  ".txt": "Text",
  ".toml": "TOML",
  ".mjs": "JS",
};

const HIDDEN_PATTERNS: RegExp[] = [
  /^security_warnings_state_/,
  /^statsig-/,
  /^stats-cache\.json$/,
];

function isHiddenFile(name: string): boolean {
  return HIDDEN_PATTERNS.some((p) => p.test(name));
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const [files, setFiles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listClaudeDir()
      .then((entries) => setFiles(entries.filter((e) => TEXT_EXTENSIONS.has(extOf(e)) && !isHiddenFile(e))))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ padding: "20px 24px" }}>
      <div style={{ marginBottom: "16px" }}>
        <h1 style={{ fontSize: "17px", fontWeight: 600, letterSpacing: "-0.3px", color: "var(--fg-base)", margin: 0 }}>
          Config Files
        </h1>
        <p style={{ fontSize: "12px", color: "var(--fg-muted)", margin: "3px 0 0" }}>
          Text files in{" "}
          <code style={{ fontFamily: "ui-monospace, monospace", fontSize: "11px" }}>~/.claude/</code>
        </p>
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

      {!loading && !error && (
        <div className="row-list">
          {files.map((name) => {
            const ext = extOf(name);
            const label = EXT_LABEL[ext] ?? ext.slice(1).toUpperCase();
            return (
              <button
                key={name}
                onClick={() => navigate(`/harness/settings/${encodeURIComponent(name)}`)}
                className="row-list-item"
                style={{
                  width: "100%",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  textAlign: "left",
                  justifyContent: "space-between",
                }}
              >
                <span style={{
                  fontFamily: "ui-monospace, monospace",
                  fontSize: "13px",
                  fontWeight: 500,
                  color: "var(--fg-base)",
                }}>
                  {name}
                </span>
                <span style={{
                  fontSize: "10px",
                  fontWeight: 500,
                  padding: "1px 6px",
                  borderRadius: "4px",
                  background: "var(--bg-base)",
                  color: "var(--fg-subtle)",
                  border: "1px solid var(--border-base)",
                  flexShrink: 0,
                  marginLeft: "12px",
                }}>
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
