import { Button, Card, StatusChip, type StatusChipVariant } from "@harness-kit/ui";
import type { CompileResult, FileAction, TargetPlatform } from "@harness-kit/core";

interface SyncPreviewProps {
  result: CompileResult;
  applying: boolean;
  onApply: () => void;
}

const ACTION_VARIANT: Record<string, StatusChipVariant> = {
  create: "success",
  update: "subtle",
  skip: "subtle",
  "needs-confirmation": "warning",
};

const PLATFORM_LABELS: Record<TargetPlatform, string> = {
  "claude-code": "Claude Code",
  cursor: "Cursor",
  copilot: "Copilot",
  codex: "Codex",
  opencode: "OpenCode",
  windsurf: "Windsurf",
  gemini: "Gemini CLI",
  junie: "Junie",
};

function ActionBadge({ action }: { action: string }) {
  return (
    <StatusChip variant={ACTION_VARIANT[action] ?? "subtle"} hideDot>
      {action}
    </StatusChip>
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
    }}>
      {PLATFORM_LABELS[platform]}
    </span>
  );
}

function FileRow({ file }: { file: FileAction }) {
  return (
    <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
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
      <Card padding="sm" style={{ display: "flex", gap: "16px", fontSize: "12px", color: "var(--fg-muted)", flexWrap: "wrap", alignItems: "center" }}>
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
          <span style={{ color: "var(--warning)" }}>
            {warningCount} warning{warningCount !== 1 ? "s" : ""}
          </span>
        )}
      </Card>

      {/* File table */}
      {fileCount > 0 && (
        <Card padding="none" style={{ overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-elevated)" }}>
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
        </Card>
      )}

      {/* Warnings */}
      {result.warnings.length > 0 && (
        <Card padding="sm">
          <p style={{ fontSize: "11px", fontWeight: 600, color: "var(--warning)", margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.3px" }}>
            Warnings
          </p>
          <ul style={{ margin: 0, paddingLeft: "16px" }}>
            {result.warnings.map((w, i) => (
              <li key={i} style={{ fontSize: "12px", color: "var(--fg-muted)", marginBottom: "2px" }}>{w}</li>
            ))}
          </ul>
        </Card>
      )}

      {/* Apply button */}
      {writeCount > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <Button variant="primary" onClick={onApply} disabled={applying}>
            {applying ? "Applying…" : `Apply ${writeCount} file${writeCount !== 1 ? "s" : ""}`}
          </Button>
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
