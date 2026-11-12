import { useCallback, useEffect, useState } from "react";
import { Button, Card, EmptyState, ErrorNotice } from "@harness-kit/ui";
import { History } from "lucide-react";
import type { SurfaceId } from "@harness-kit/core";
import { listChanges, undoChange, type ChangeEntry } from "../../lib/tauri";
import { surfaceLabel } from "../../lib/surface-labels";
import { errorDetails } from "../../lib/error-details";

const KIND_LABEL: Record<string, string> = {
  "mcp-server": "MCP server",
  skill: "Skill",
  instruction: "Instructions",
  hook: "Hook",
  command: "Command",
  agent: "Agent",
  plugin: "Plugin",
};

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** "MCP server github", from an identity key like `mcp-server:github`. */
function describeKey(key: string): string {
  const at = key.indexOf(":");
  if (at < 0) return key;
  const kind = key.slice(0, at);
  return `${KIND_LABEL[kind] ?? kind} ${key.slice(at + 1)}`;
}

function describeWhat(entry: ChangeEntry): string {
  if (entry.identityKeys.length === 0) return "Changed config files";
  const shown = entry.identityKeys.slice(0, 2).map(describeKey).join(", ");
  const more = entry.identityKeys.length - 2;
  return more > 0 ? `${shown}, and ${more} more` : shown;
}

function describeWhere(entry: ChangeEntry): string {
  const surfaces = entry.surfaces.map((id) => surfaceLabel(id as SurfaceId)).join(", ");
  const copy = entry.copiedFrom ? `Copied from ${surfaceLabel(entry.copiedFrom as SurfaceId)} to ` : "";
  return `${copy}${surfaces}`;
}

function describeFiles(entry: ChangeEntry): string {
  if (entry.files.length === 0) return "";
  const [first] = entry.files;
  return entry.files.length > 1 ? `~/${first} and ${entry.files.length - 1} more` : `~/${first}`;
}

/**
 * Settings › Activity › Changes: what the app changed on this machine, newest
 * first. Each change that can still be undone has Undo. The webview sends only
 * the change's id; Rust checks that every file still holds what the change
 * left there and refuses if one was edited since.
 */
export function ChangesList() {
  const [changes, setChanges] = useState<ChangeEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // Per-change refusal text, kept on the row so it stays beside what it is about.
  const [undoErrors, setUndoErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setChanges(await listChanges());
    } catch (error) {
      setChanges(null);
      setLoadError(errorDetails(error));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleUndo(entry: ChangeEntry) {
    setConfirming(null);
    setBusy(entry.transactionId);
    setNotice(null);
    setUndoErrors((current) => {
      const { [entry.transactionId]: _dropped, ...rest } = current;
      return rest;
    });
    try {
      const outcome = await undoChange(entry.transactionId);
      setNotice(
        outcome.warning
          ? `${describeWhat(entry)} was put back. ${outcome.warning}`
          : `${describeWhat(entry)} was put back.`,
      );
    } catch (error) {
      setUndoErrors((current) => ({ ...current, [entry.transactionId]: errorDetails(error) }));
    } finally {
      setBusy(null);
    }
    await load();
  }

  return (
    <section aria-labelledby="changes-heading" style={{ padding: "20px 24px 0" }}>
      <div style={{ marginBottom: "16px" }}>
        <h2
          id="changes-heading"
          style={{ fontSize: "17px", fontWeight: 600, letterSpacing: "-0.3px", color: "var(--fg-base)", margin: 0 }}
        >
          Changes
        </h2>
        <p style={{ fontSize: "12px", color: "var(--fg-muted)", margin: "3px 0 0" }}>
          What this app changed in your config files. Undo puts a file back as it was, unless it has been edited since.
        </p>
      </div>

      {loadError && (
        <ErrorNotice
          title="Couldn't load the list of changes"
          details={loadError}
          action={{ label: "Retry", onClick: () => void load() }}
        />
      )}

      {notice && (
        <div
          role="status"
          style={{
            padding: "6px 10px",
            marginBottom: 12,
            borderRadius: 6,
            background: "var(--success-light)",
            color: "var(--success-text)",
            fontSize: 11.5,
          }}
        >
          {notice}
        </div>
      )}

      {changes && (
        <Card padding="none" style={{ overflow: "hidden" }}>
          {changes.length === 0 ? (
            <EmptyState
              icon={<History size={28} strokeWidth={1.5} />}
              title="No changes yet"
              description="Changes made from Machine and the MCP servers page appear here."
            />
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {changes.map((entry) => (
                <li
                  key={entry.transactionId}
                  data-testid="change-row"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "140px 1fr auto",
                    gap: 12,
                    alignItems: "start",
                    padding: "9px 16px",
                    borderBottom: "1px solid var(--separator)",
                  }}
                >
                  <span style={{ fontSize: "11px", color: "var(--fg-subtle)" }}>{formatTime(entry.appliedAt)}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: "12px", color: "var(--fg-base)" }}>{describeWhat(entry)}</div>
                    <div style={{ fontSize: "11px", color: "var(--fg-muted)", marginTop: 2 }}>
                      {describeWhere(entry)}
                      {entry.files.length > 0 && <span> · {describeFiles(entry)}</span>}
                    </div>
                    {!entry.undoable && entry.reason && (
                      <div style={{ fontSize: "11px", color: "var(--fg-subtle)", marginTop: 2 }}>
                        {entry.status === "undone" ? "Undone." : entry.reason}
                      </div>
                    )}
                    {undoErrors[entry.transactionId] && (
                      <div role="alert" style={{ fontSize: "11px", color: "var(--danger-text)", marginTop: 4 }}>
                        {undoErrors[entry.transactionId]}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    {entry.undoable &&
                      (confirming === entry.transactionId ? (
                        <>
                          <Button
                            variant="danger"
                            size="sm"
                            disabled={busy !== null}
                            onClick={() => void handleUndo(entry)}
                          >
                            Undo this change
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setConfirming(null)}>
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy !== null}
                          onClick={() => setConfirming(entry.transactionId)}
                        >
                          Undo
                        </Button>
                      ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </section>
  );
}
