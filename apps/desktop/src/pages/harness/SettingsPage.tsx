import { useEffect, useState } from "react";
import { listClaudeDir } from "../../lib/tauri";

export default function SettingsPage() {
  const [entries, setEntries] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listClaudeDir()
      .then(setEntries)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight" style={{ color: "var(--fg-base)" }}>
          Settings
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--fg-muted)" }}>
          Files and directories in <code style={{ fontFamily: "monospace" }}>~/.claude/</code>.
        </p>
      </div>

      {loading && <p className="text-sm" style={{ color: "var(--fg-subtle)" }}>Loading…</p>}

      {error && (
        <div
          className="rounded-lg p-4 text-sm"
          style={{ background: "var(--bg-surface)", border: "1px solid var(--border-base)", color: "var(--danger)" }}
        >
          {error}
        </div>
      )}

      {!loading && !error && (
        <div
          className="rounded-lg divide-y"
          style={{ background: "var(--bg-surface)", border: "1px solid var(--border-base)" }}
        >
          {entries.map((entry) => (
            <div key={entry} className="px-4 py-2">
              <span className="text-xs font-mono" style={{ color: "var(--fg-muted)" }}>
                {entry}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
