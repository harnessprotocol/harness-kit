import type { CompileResult, FileAction, TargetPlatform } from "@harness-kit/core";

interface SyncPreviewProps {
  result: CompileResult;
  applying: boolean;
  onApply: () => void;
}

const ACTION_COLORS: Record<string, string> = {
  create: "var(--success, #22c55e)",
  update: "var(--accent)",
  skip: "var(--fg-subtle)",
  "needs-confirmation": "var(--warning, #f59e0b)",
};

const PLATFORM_LABELS: Record<TargetPlatform, string> = {
  "claude-code": "Claude Code",
  cursor: "Cursor",
  copilot: "Copilot",
};

function ActionBadge({ action }: { action: string }) {
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      padding: "1px 6px",
      borderRadius: "4px",
      fontSize: "10px",
      fontWeight: 600,
      textTransform: "uppercase",
      letterSpacing: "0.3px",
      background: `${ACTION_COLORS[action] ?? "var(--fg-subtle)"}20`,
      color: ACTION_COLORS[action] ?? "var(--fg-subtle)",
      border: `1px solid ${ACTION_COLORS[action] ?? "var(--fg-subtle)"}40`,
    }}>
      {action}
    </span>
  );
}

function PlatformBadge({ platform }: { platform: TargetPlatform }) {
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      padding: "1px 6px",
      borderRadius: "4px",
      fontSize: "10px",
      fontWeight: 500,
      background: "var(--bg-elevated)",
      color: "var(--fg-subtle)",
      border: "1px solid var(--border-base)",
    }}>
      {PLATFORM_LABELS[platform]}
    </span>
  );
}

function FileRow({ file }: { file: FileAction }) {
  return (
    <tr style={{ borderBottom: "1px solid var(--border-base)" }}>
      <td style={{ padding: "6px 8px", fontFamily: "ui-monospace, monospace", fontSize: "11px", color: "var(--fg-base)" }}>
        {file.path}
      </td>
      <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>
        <ActionBadge action={file.action} />
      </td>
      <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>
        <PlatformBadge platform={file.platform} />
      </td>
      <td style={{ padding: "6px 8px", textAlign: "right", fontSize: "11px", color: "var(--fg-subtle)" }}>
        {file.linesAdded != null ? `+${file.linesAdded}` : "—"}
      </td>
    </tr>
  );
}

export default function SyncPreview({ result, applying, onApply }: SyncPreviewProps) {
  const fileCount = result.files.length;
  const writeCount = result.files.filter((f) => f.action === "create" || f.action === "update").length;
  const warningCount = result.warnings.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {/* Summary bar */}
      <div style={{
        display: "flex",
        gap: "16px",
        padding: "10px 14px",
        background: "var(--bg-surface)",
        border: "1px solid var(--border-base)",
        borderRadius: "8px",
        fontSize: "12px",
        color: "var(--fg-muted)",
        flexWrap: "wrap",
        alignItems: "center",
      }}>
        <span>
          <strong style={{ color: "var(--fg-base)" }}>{result.harnessName}</strong>
        </span>
        <span>{result.targets.map((t) => PLATFORM_LABELS[t]).join(", ")}</span>
        <span>
          <strong style={{ color: "var(--fg-base)" }}>{fileCount}</strong> file{fileCount !== 1 ? "s" : ""}
        </span>
        <span>
          <strong style={{ color: "var(--fg-base)" }}>{writeCount}</strong> write{writeCount !== 1 ? "s" : ""}
        </span>
        {warningCount > 0 && (
          <span style={{ color: "var(--warning, #f59e0b)" }}>
            {warningCount} warning{warningCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* File table */}
      {fileCount > 0 && (
        <div style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-base)",
          borderRadius: "8px",
          overflow: "hidden",
        }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-base)", background: "var(--bg-elevated)" }}>
                <th style={{ padding: "6px 8px", textAlign: "left", fontSize: "10px", fontWeight: 600, color: "var(--fg-subtle)", textTransform: "uppercase", letterSpacing: "0.3px" }}>Path</th>
                <th style={{ padding: "6px 8px", textAlign: "left", fontSize: "10px", fontWeight: 600, color: "var(--fg-subtle)", textTransform: "uppercase", letterSpacing: "0.3px" }}>Action</th>
                <th style={{ padding: "6px 8px", textAlign: "left", fontSize: "10px", fontWeight: 600, color: "var(--fg-subtle)", textTransform: "uppercase", letterSpacing: "0.3px" }}>Platform</th>
                <th style={{ padding: "6px 8px", textAlign: "right", fontSize: "10px", fontWeight: 600, color: "var(--fg-subtle)", textTransform: "uppercase", letterSpacing: "0.3px" }}>Lines</th>
              </tr>
            </thead>
            <tbody>
              {result.files.map((file, i) => (
                <FileRow key={`${file.platform}-${file.path}-${i}`} file={file} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Warnings */}
      {result.warnings.length > 0 && (
        <div style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-base)",
          borderRadius: "8px",
          padding: "10px 14px",
        }}>
          <p style={{ fontSize: "11px", fontWeight: 600, color: "var(--warning, #f59e0b)", margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.3px" }}>
            Warnings
          </p>
          <ul style={{ margin: 0, paddingLeft: "16px" }}>
            {result.warnings.map((w, i) => (
              <li key={i} style={{ fontSize: "12px", color: "var(--fg-muted)", marginBottom: "2px" }}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Apply button */}
      {writeCount > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button
            onClick={onApply}
            disabled={applying}
            style={{
              padding: "7px 16px",
              borderRadius: "6px",
              border: "none",
              background: applying ? "var(--bg-elevated)" : "var(--accent)",
              color: applying ? "var(--fg-subtle)" : "var(--accent-text, #fff)",
              fontSize: "12px",
              fontWeight: 600,
              cursor: applying ? "not-allowed" : "pointer",
            }}
          >
            {applying ? "Applying…" : `Apply ${writeCount} file${writeCount !== 1 ? "s" : ""}`}
          </button>
          <span style={{ fontSize: "11px", color: "var(--fg-subtle)" }}>
            A backup will be created automatically before writing.
          </span>
        </div>
      )}

      {writeCount === 0 && (
        <p style={{ fontSize: "12px", color: "var(--fg-muted)", margin: 0 }}>
          No files to write — all targets are already up to date.
        </p>
      )}
    </div>
  );
}
