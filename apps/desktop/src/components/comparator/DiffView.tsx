import { useState } from "react";
import type { FileDiff } from "@harness-kit/shared";

interface DiffViewProps {
  panels: Array<{ panelId: string; harnessName: string; diffs: FileDiff[] }>;
}

function parseDiffStats(diffText: string): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const line of diffText.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) added++;
    if (line.startsWith("-") && !line.startsWith("---")) removed++;
  }
  return { added, removed };
}

function DiffDetail({ diff }: { diff: FileDiff }) {
  const lines = diff.diffText.split("\n");

  return (
    <div
      style={{
        fontFamily: "ui-monospace, SFMono-Regular, monospace",
        fontSize: "11px",
        lineHeight: "1.6",
        background: "var(--bg-surface)",
        border: "1px solid var(--border-base)",
        borderRadius: "6px",
        overflow: "auto",
        maxHeight: "400px",
      }}
    >
      {lines.map((line, i) => {
        let bg = "transparent";
        let color = "var(--fg-muted)";
        if (line.startsWith("+") && !line.startsWith("+++")) {
          bg = "rgba(22, 163, 74, 0.1)";
          color = "var(--success)";
        } else if (line.startsWith("-") && !line.startsWith("---")) {
          bg = "rgba(220, 38, 38, 0.08)";
          color = "var(--danger)";
        } else if (line.startsWith("@@")) {
          color = "var(--accent-text)";
        }
        return (
          <div
            key={i}
            style={{
              padding: "0 10px",
              background: bg,
              color,
              whiteSpace: "pre",
              minHeight: "1.6em",
            }}
          >
            {line}
          </div>
        );
      })}
    </div>
  );
}

export default function DiffView({ panels }: DiffViewProps) {
  const [selectedFile, setSelectedFile] = useState<{
    panelId: string;
    filePath: string;
  } | null>(null);

  const hasDiffs = panels.some((p) => p.diffs.length > 0);

  if (!hasDiffs) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          padding: "40px",
          color: "var(--fg-subtle)",
          fontSize: "13px",
          textAlign: "center",
        }}
      >
        <div>
          <p style={{ fontWeight: 500, marginBottom: "4px" }}>No diffs available</p>
          <p style={{ fontSize: "11px" }}>
            Diff view requires git worktree isolation. Enable it in setup by using a git repository.
          </p>
        </div>
      </div>
    );
  }

  const selectedDiff = selectedFile
    ? panels
        .find((p) => p.panelId === selectedFile.panelId)
        ?.diffs.find((d) => d.filePath === selectedFile.filePath)
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* File summary — columns per panel */}
      <div
        style={{
          display: "flex",
          gap: "1px",
          background: "var(--separator)",
          flexShrink: 0,
          maxHeight: "240px",
          overflow: "auto",
        }}
      >
        {panels.map((panel) => (
          <div
            key={panel.panelId}
            style={{ flex: 1, background: "var(--bg-base)", minWidth: 0 }}
          >
            <div
              style={{
                padding: "8px 12px",
                borderBottom: "1px solid var(--separator)",
                fontSize: "12px",
                fontWeight: 600,
                color: "var(--fg-base)",
              }}
            >
              {panel.harnessName}
              <span style={{ fontWeight: 400, color: "var(--fg-subtle)", marginLeft: "6px" }}>
                {panel.diffs.length} file{panel.diffs.length !== 1 ? "s" : ""}
              </span>
            </div>
            {panel.diffs.length === 0 ? (
              <div style={{ padding: "12px", fontSize: "11px", color: "var(--fg-subtle)" }}>
                No changes
              </div>
            ) : (
              panel.diffs.map((diff) => {
                const stats = parseDiffStats(diff.diffText);
                const isActive =
                  selectedFile?.panelId === panel.panelId &&
                  selectedFile?.filePath === diff.filePath;
                return (
                  <div
                    key={diff.filePath}
                    onClick={() =>
                      setSelectedFile({ panelId: panel.panelId, filePath: diff.filePath })
                    }
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "5px 12px",
                      borderBottom: "1px solid var(--separator)",
                      cursor: "pointer",
                      background: isActive ? "var(--accent-light)" : "transparent",
                      transition: "background 0.1s",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "11px",
                        fontFamily: "ui-monospace, monospace",
                        color: isActive ? "var(--accent-text)" : "var(--fg-muted)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {diff.filePath}
                    </span>
                    <span style={{ fontSize: "10px", flexShrink: 0, marginLeft: "8px" }}>
                      {stats.added > 0 && (
                        <span style={{ color: "var(--success)", marginRight: "4px" }}>
                          +{stats.added}
                        </span>
                      )}
                      {stats.removed > 0 && (
                        <span style={{ color: "var(--danger)" }}>-{stats.removed}</span>
                      )}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        ))}
      </div>

      {/* Diff detail */}
      <div style={{ flex: 1, overflow: "auto", padding: "12px" }}>
        {selectedDiff ? (
          <div>
            <div
              style={{
                fontSize: "11px",
                fontFamily: "ui-monospace, monospace",
                color: "var(--fg-muted)",
                marginBottom: "8px",
              }}
            >
              {selectedFile!.filePath}
            </div>
            <DiffDetail diff={selectedDiff} />
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              color: "var(--fg-subtle)",
              fontSize: "12px",
            }}
          >
            Select a file to view its diff
          </div>
        )}
      </div>
    </div>
  );
}
