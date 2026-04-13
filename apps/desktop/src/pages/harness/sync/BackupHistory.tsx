import { useState } from "react";
import type { BackupManifest } from "../../../lib/tauri";
import { syncRestoreBackup } from "../../../lib/tauri";

interface BackupHistoryProps {
  backups: BackupManifest[];
  projectDir: string;
  onRestored: () => void;
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function BackupRow({
  backup,
  onRestore,
}: {
  backup: BackupManifest;
  onRestore: (id: string) => void;
}) {
  const fileCount = backup.files.length;

  return (
    <tr style={{ borderBottom: "1px solid var(--border-base)" }}>
      <td style={{ padding: "7px 10px", fontSize: "11px", color: "var(--fg-muted)" }}>
        {formatTimestamp(backup.timestamp)}
      </td>
      <td style={{ padding: "7px 10px", fontSize: "11px", color: "var(--fg-base)" }}>
        {backup.harnessName}
      </td>
      <td style={{ padding: "7px 10px", fontSize: "11px", color: "var(--fg-subtle)" }}>
        {backup.platforms.join(", ")}
      </td>
      <td
        style={{
          padding: "7px 10px",
          fontSize: "11px",
          color: "var(--fg-subtle)",
          textAlign: "right",
        }}
      >
        {fileCount} file{fileCount !== 1 ? "s" : ""}
      </td>
      <td style={{ padding: "7px 10px", textAlign: "right" }}>
        <button
          onClick={() => onRestore(backup.id)}
          style={{
            padding: "3px 10px",
            borderRadius: "5px",
            border: "1px solid var(--border-base)",
            background: "var(--bg-elevated)",
            color: "var(--fg-base)",
            fontSize: "11px",
            cursor: "pointer",
          }}
        >
          Restore
        </button>
      </td>
    </tr>
  );
}

export default function BackupHistory({ backups, projectDir, onRestored }: BackupHistoryProps) {
  const [expanded, setExpanded] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const filtered = backups.filter((b) => b.projectDir === projectDir);

  async function handleRestore(id: string) {
    setConfirmId(id);
  }

  async function confirmRestore() {
    if (!confirmId) return;
    setRestoring(confirmId);
    setError(null);
    setConfirmId(null);
    try {
      await syncRestoreBackup(confirmId);
      onRestored();
    } catch (e) {
      setError(String(e));
    } finally {
      setRestoring(null);
    }
  }

  if (filtered.length === 0 && !expanded) return null;

  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-base)",
        borderRadius: "8px",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          padding: "10px 14px",
          border: "none",
          background: "transparent",
          cursor: "pointer",
          color: "var(--fg-base)",
          fontSize: "12px",
          fontWeight: 600,
          textAlign: "left",
        }}
      >
        <span>Backup History{filtered.length > 0 ? ` (${filtered.length})` : ""}</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 20 20"
          fill="currentColor"
          style={{
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.15s",
            color: "var(--fg-subtle)",
          }}
        >
          <path
            fillRule="evenodd"
            d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {expanded && (
        <>
          {error && (
            <div style={{ padding: "8px 14px", fontSize: "12px", color: "var(--danger)" }}>
              {error}
            </div>
          )}

          {filtered.length === 0 ? (
            <p
              style={{
                padding: "12px 14px",
                fontSize: "12px",
                color: "var(--fg-subtle)",
                margin: 0,
              }}
            >
              No backups for this project yet.
            </p>
          ) : (
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                borderTop: "1px solid var(--border-base)",
              }}
            >
              <thead>
                <tr style={{ background: "var(--bg-elevated)" }}>
                  <th
                    style={{
                      padding: "5px 10px",
                      textAlign: "left",
                      fontSize: "10px",
                      fontWeight: 600,
                      color: "var(--fg-subtle)",
                      textTransform: "uppercase",
                      letterSpacing: "0.3px",
                    }}
                  >
                    When
                  </th>
                  <th
                    style={{
                      padding: "5px 10px",
                      textAlign: "left",
                      fontSize: "10px",
                      fontWeight: 600,
                      color: "var(--fg-subtle)",
                      textTransform: "uppercase",
                      letterSpacing: "0.3px",
                    }}
                  >
                    Harness
                  </th>
                  <th
                    style={{
                      padding: "5px 10px",
                      textAlign: "left",
                      fontSize: "10px",
                      fontWeight: 600,
                      color: "var(--fg-subtle)",
                      textTransform: "uppercase",
                      letterSpacing: "0.3px",
                    }}
                  >
                    Platforms
                  </th>
                  <th
                    style={{
                      padding: "5px 10px",
                      textAlign: "right",
                      fontSize: "10px",
                      fontWeight: 600,
                      color: "var(--fg-subtle)",
                      textTransform: "uppercase",
                      letterSpacing: "0.3px",
                    }}
                  >
                    Files
                  </th>
                  <th style={{ padding: "5px 10px" }} />
                </tr>
              </thead>
              <tbody>
                {filtered.map((b) => (
                  <BackupRow key={b.id} backup={b} onRestore={handleRestore} />
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {/* Restore confirmation */}
      {confirmId && (
        <div
          style={{
            padding: "12px 14px",
            borderTop: "1px solid var(--border-base)",
            background: "var(--bg-elevated)",
            display: "flex",
            alignItems: "center",
            gap: "10px",
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: "12px", color: "var(--fg-base)", flex: 1 }}>
            Restore this backup? A safety backup of current files will be created first.
          </span>
          <button
            onClick={() => setConfirmId(null)}
            style={{
              padding: "4px 10px",
              borderRadius: "5px",
              border: "1px solid var(--border-base)",
              background: "var(--bg-surface)",
              color: "var(--fg-base)",
              fontSize: "11px",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={confirmRestore}
            disabled={!!restoring}
            style={{
              padding: "4px 10px",
              borderRadius: "5px",
              border: "none",
              background: "var(--accent)",
              color: "var(--accent-text, #fff)",
              fontSize: "11px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {restoring ? "Restoring…" : "Confirm Restore"}
          </button>
        </div>
      )}
    </div>
  );
}
