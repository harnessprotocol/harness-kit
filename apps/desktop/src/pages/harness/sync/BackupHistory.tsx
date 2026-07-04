import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button, Card } from "@harness-kit/ui";
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
    <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
      <td style={{ padding: "7px 10px", fontSize: "11px", color: "var(--fg-muted)" }}>
        {formatTimestamp(backup.timestamp)}
      </td>
      <td style={{ padding: "7px 10px", fontSize: "11px", color: "var(--fg-base)" }}>
        {backup.harnessName}
      </td>
      <td style={{ padding: "7px 10px", fontSize: "11px", color: "var(--fg-subtle)" }}>
        {backup.platforms.join(", ")}
      </td>
      <td style={{ padding: "7px 10px", fontSize: "11px", color: "var(--fg-subtle)", textAlign: "right" }}>
        {fileCount} file{fileCount !== 1 ? "s" : ""}
      </td>
      <td style={{ padding: "7px 10px", textAlign: "right" }}>
        <Button variant="ghost" size="sm" onClick={() => onRestore(backup.id)}>
          Restore
        </Button>
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
    <Card padding="none" style={{ overflow: "hidden" }}>
      {/* Header */}
      <button
        className="hk-reset-btn"
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          padding: "10px 14px",
          cursor: "pointer",
          color: "var(--fg-base)",
          fontSize: "12px",
          fontWeight: 600,
          textAlign: "left",
        }}
      >
        <span>Backup History{filtered.length > 0 ? ` (${filtered.length})` : ""}</span>
        <ChevronDown
          size={12}
          strokeWidth={1.7}
          style={{
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.15s ease-out",
            color: "var(--fg-subtle)",
          }}
        />
      </button>

      {expanded && (
        <>
          {error && (
            <div style={{ padding: "8px 14px", fontSize: "12px", color: "var(--danger)" }}>
              {error}
            </div>
          )}

          {filtered.length === 0 ? (
            <p style={{ padding: "12px 14px", fontSize: "12px", color: "var(--fg-subtle)", margin: 0 }}>
              No backups for this project yet.
            </p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", borderTop: "1px solid var(--border-subtle)" }}>
              <thead>
                <tr style={{ background: "var(--bg-elevated)" }}>
                  <th style={{ padding: "5px 10px", textAlign: "left", fontSize: "10px", fontWeight: 600, color: "var(--fg-subtle)", textTransform: "uppercase", letterSpacing: "0.3px" }}>When</th>
                  <th style={{ padding: "5px 10px", textAlign: "left", fontSize: "10px", fontWeight: 600, color: "var(--fg-subtle)", textTransform: "uppercase", letterSpacing: "0.3px" }}>Harness</th>
                  <th style={{ padding: "5px 10px", textAlign: "left", fontSize: "10px", fontWeight: 600, color: "var(--fg-subtle)", textTransform: "uppercase", letterSpacing: "0.3px" }}>Platforms</th>
                  <th style={{ padding: "5px 10px", textAlign: "right", fontSize: "10px", fontWeight: 600, color: "var(--fg-subtle)", textTransform: "uppercase", letterSpacing: "0.3px" }}>Files</th>
                  <th style={{ padding: "5px 10px" }} />
                </tr>
              </thead>
              <tbody>
                {filtered.map((b) => (
                  <BackupRow
                    key={b.id}
                    backup={b}
                    onRestore={handleRestore}
                  />
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {/* Restore confirmation */}
      {confirmId && (
        <div style={{
          padding: "12px 14px",
          borderTop: "1px solid var(--border-subtle)",
          background: "var(--bg-elevated)",
          display: "flex",
          alignItems: "center",
          gap: "10px",
          flexWrap: "wrap",
        }}>
          <span style={{ fontSize: "12px", color: "var(--fg-base)", flex: 1 }}>
            Restore this backup? A safety backup of current files will be created first.
          </span>
          <Button variant="ghost" size="sm" onClick={() => setConfirmId(null)}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={confirmRestore} disabled={!!restoring}>
            {restoring ? "Restoring…" : "Confirm Restore"}
          </Button>
        </div>
      )}
    </Card>
  );
}
