import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";

interface ClaudeFileListPanelProps {
  files: string[];
  loading: boolean;
  error: string | null;
  selectedFile: string | null;
  onSelectFile: (name: string) => void;
  isDirty: boolean;
}

export default function ClaudeFileListPanel({
  files,
  loading,
  error,
  selectedFile,
  onSelectFile,
  isDirty,
}: ClaudeFileListPanelProps) {
  const navigate = useNavigate();
  const [pendingFile, setPendingFile] = useState<string | null>(null);

  const handleSelect = useCallback(
    (name: string) => {
      if (name === selectedFile) return;
      if (isDirty) {
        setPendingFile(name);
      } else {
        onSelectFile(name);
      }
    },
    [selectedFile, isDirty, onSelectFile],
  );

  const handleConfirmDiscard = useCallback(() => {
    if (!pendingFile) return;
    onSelectFile(pendingFile);
    setPendingFile(null);
  }, [pendingFile, onSelectFile]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "10px 12px 6px",
          fontSize: "10px",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: "var(--fg-subtle)",
          flexShrink: 0,
        }}
      >
        Config Files
      </div>

      {pendingFile && (
        <div
          style={{
            margin: "0 8px 6px",
            padding: "8px 10px",
            background: "var(--bg-surface)",
            border: "1px solid var(--border-base)",
            borderRadius: "6px",
            fontSize: "11px",
            color: "var(--fg-base)",
            flexShrink: 0,
          }}
        >
          <div style={{ marginBottom: "6px" }}>
            Unsaved changes in{" "}
            <code style={{ fontFamily: "ui-monospace, monospace" }}>{selectedFile}</code>. Discard
            and switch?
          </div>
          <div style={{ display: "flex", gap: "6px" }}>
            <button
              onClick={handleConfirmDiscard}
              style={{
                fontSize: "11px",
                padding: "2px 8px",
                borderRadius: "4px",
                border: "1px solid var(--border-base)",
                background: "var(--danger-light)",
                color: "var(--danger)",
                cursor: "pointer",
              }}
            >
              Discard
            </button>
            <button
              onClick={() => setPendingFile(null)}
              style={{
                fontSize: "11px",
                padding: "2px 8px",
                borderRadius: "4px",
                border: "1px solid var(--border-base)",
                background: "transparent",
                color: "var(--fg-muted)",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div style={{ flex: 1, overflow: "auto" }}>
        {loading && (
          <p
            style={{ fontSize: "12px", color: "var(--fg-subtle)", padding: "8px 12px", margin: 0 }}
          >
            Loading...
          </p>
        )}
        {error && (
          <p style={{ fontSize: "12px", color: "var(--danger)", padding: "8px 12px", margin: 0 }}>
            {error}
          </p>
        )}
        {!loading && !error && files.length === 0 && (
          <div style={{ padding: "8px 12px", fontSize: "12px", color: "var(--fg-subtle)" }}>
            No files found.{" "}
            <button
              onClick={() => navigate("/preferences")}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
                color: "var(--accent-text)",
                fontSize: "12px",
                textDecoration: "underline",
              }}
            >
              Change detail level in Preferences
            </button>
          </div>
        )}
        {files.map((name) => (
          <button
            key={name}
            onClick={() => handleSelect(name)}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              padding: "6px 12px",
              background: selectedFile === name ? "var(--bg-elevated)" : "transparent",
              border: "none",
              borderLeft:
                selectedFile === name ? "2px solid var(--accent)" : "2px solid transparent",
              cursor: "pointer",
              fontSize: "12px",
              fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace",
              color: selectedFile === name ? "var(--fg-base)" : "var(--fg-muted)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {name}
          </button>
        ))}
      </div>
    </div>
  );
}
