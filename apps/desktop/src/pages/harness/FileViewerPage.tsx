import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Card } from "@harness-kit/ui";
import { readClaudeMd } from "../../lib/tauri";
import MarkdownPanel from "../../components/MarkdownPanel";

function extOf(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx === -1 ? "" : name.slice(idx);
}

export default function FileViewerPage() {
  const { filename } = useParams<{ filename: string }>();
  const navigate = useNavigate();
  const name = filename ? decodeURIComponent(filename) : "";

  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!name) return;
    readClaudeMd(`~/.claude/${name}`)
      .then(setContent)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [name]);

  const defaultView = extOf(name) === ".md" ? "preview" : "raw";

  return (
    <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div style={{ marginBottom: "16px", flexShrink: 0 }}>
        <button
          className="hk-reset-btn"
          onClick={() => navigate("/harness/settings")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "4px",
            cursor: "pointer",
            fontSize: "12px",
            color: "var(--fg-subtle)",
            marginBottom: "10px",
          }}
        >
          <ArrowLeft size={12} strokeWidth={1.7} aria-hidden="true" />
          Config Files
        </button>
        <h1 style={{
          fontSize: "17px",
          fontWeight: 600,
          letterSpacing: "-0.3px",
          color: "var(--fg-base)",
          margin: 0,
          fontFamily: "ui-monospace, monospace",
        }}>
          {name}
        </h1>
        <p style={{ fontSize: "12px", color: "var(--fg-muted)", margin: "3px 0 0", fontFamily: "ui-monospace, monospace" }}>
          ~/.claude/{name}
        </p>
      </div>

      {loading && <p style={{ fontSize: "13px", color: "var(--fg-subtle)" }}>Loading…</p>}

      {error && (
        <Card padding="sm" style={{ fontSize: "13px", color: "var(--danger)" }}>
          {error}
        </Card>
      )}

      {!loading && !error && content !== null && (
        <MarkdownPanel content={content} defaultView={defaultView} fill />
      )}
    </div>
  );
}
