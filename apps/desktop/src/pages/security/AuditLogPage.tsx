import { useEffect, useState, useCallback } from "react";
import { Button, Card, EmptyState, StatusChip, type StatusChipVariant } from "@harness-kit/ui";
import { ScrollText } from "lucide-react";
import { listAuditEntries, clearAuditEntries } from "../../lib/tauri";
import type { AuditEntry } from "@harness-kit/shared";
import { useArrowNavigation } from "../../hooks/useArrowNavigation";
import ContextMenu from "../../components/ContextMenu";

const PAGE_SIZE = 25;

type CategoryFilter = "all" | "permissions" | "secrets";

function Pill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      className="hk-reset-btn"
      onClick={onClick}
      aria-pressed={active}
      style={{
        fontSize: "11px",
        fontWeight: active ? 600 : 400,
        padding: "3px 10px",
        borderRadius: "12px",
        background: active ? "var(--accent-light)" : "var(--bg-elevated)",
        color: active ? "var(--accent-text)" : "var(--fg-muted)",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

const EVENT_VARIANT: Record<string, StatusChipVariant> = {
  permission_change: "subtle",
  preset_applied: "success",
  secret_access: "warning",
  secret_delete: "danger",
};

function EventBadge({ eventType }: { eventType: string }) {
  const label = eventType.replace(/_/g, " ");
  return (
    <StatusChip variant={EVENT_VARIANT[eventType] ?? "subtle"} hideDot>
      {label}
    </StatusChip>
  );
}

function formatTimestamp(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleString(undefined, {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return ts;
  }
}

export default function AuditLogPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<CategoryFilter>("all");
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; entry: AuditEntry } | null>(null);

  const { focusedIndex: auditFocusedIndex, onKeyDown: onAuditKeyDown } = useArrowNavigation({
    count: entries.length,
    onActivate: (i) => {
      const entry = entries[i];
      if (entry?.details) setExpandedId(expandedId === entry.id ? null : entry.id);
    },
  });

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      const category = filter === "all" ? undefined : filter;
      const result = await listAuditEntries(PAGE_SIZE, page * PAGE_SIZE, category);
      setEntries(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [filter, page]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  function handleFilterChange(f: CategoryFilter) {
    setFilter(f);
    setPage(0);
  }

  async function handleClear() {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      await clearAuditEntries(thirtyDaysAgo.toISOString());
      setConfirmClear(false);
      setPage(0);
      await fetchEntries();
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <div style={{ padding: "20px 24px" }}>
      {/* Header */}
      <div style={{ marginBottom: "16px" }}>
        <h1 style={{ fontSize: "17px", fontWeight: 600, letterSpacing: "-0.3px", color: "var(--fg-base)", margin: 0 }}>
          Audit Log
        </h1>
        <p style={{ fontSize: "12px", color: "var(--fg-muted)", margin: "3px 0 0" }}>
          Track permission changes, secret operations, and preset applications.
        </p>
      </div>

      {error && (
        <Card padding="sm" style={{ fontSize: "13px", color: "var(--danger)", marginBottom: "16px" }}>
          {error}
        </Card>
      )}

      {/* Filter bar */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
        <Pill label="All" active={filter === "all"} onClick={() => handleFilterChange("all")} />
        <Pill label="Permissions" active={filter === "permissions"} onClick={() => handleFilterChange("permissions")} />
        <Pill label="Secrets" active={filter === "secrets"} onClick={() => handleFilterChange("secrets")} />

        <div style={{ flex: 1 }} />

        {!confirmClear ? (
          <Button variant="ghost" size="sm" onClick={() => setConfirmClear(true)}>
            Clear old entries
          </Button>
        ) : (
          <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
            <span style={{ fontSize: "11px", color: "var(--fg-muted)" }}>
              Clear entries older than 30 days?
            </span>
            <Button variant="danger" size="sm" onClick={handleClear}>
              Confirm
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmClear(false)}>
              Cancel
            </Button>
          </div>
        )}
      </div>

      {/* Table */}
      <Card
        padding="none"
        tabIndex={0}
        onKeyDown={onAuditKeyDown}
        style={{ overflow: "hidden" }}
      >
        {/* Header row */}
        <div style={{
          display: "grid", gridTemplateColumns: "140px 130px 1fr 80px",
          padding: "6px 16px", borderBottom: "1px solid var(--separator)",
          fontSize: "10px", fontWeight: 600, textTransform: "uppercase",
          letterSpacing: "0.05em", color: "var(--fg-subtle)",
        }}>
          <span>Timestamp</span>
          <span>Event</span>
          <span>Summary</span>
          <span>Source</span>
        </div>

        {loading ? (
          <div style={{ padding: "20px 16px", textAlign: "center" }}>
            <p style={{ fontSize: "13px", color: "var(--fg-subtle)" }}>Loading...</p>
          </div>
        ) : entries.length === 0 ? (
          <EmptyState
            icon={<ScrollText size={28} strokeWidth={1.5} />}
            title="No audit entries found"
            description="Entries are created when permissions or secrets are modified."
          />
        ) : (
          entries.map((entry, idx) => (
            <div key={entry.id}>
              <div
                onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({ x: e.clientX, y: e.clientY, entry });
                }}
                style={{
                  display: "grid", gridTemplateColumns: "140px 130px 1fr 80px",
                  padding: "7px 16px", borderBottom: "1px solid var(--separator)",
                  cursor: entry.details ? "pointer" : "default",
                  transition: "background 0.1s",
                  outline: auditFocusedIndex === idx ? "2px solid var(--accent)" : "none",
                  outlineOffset: "-2px",
                }}
                onMouseEnter={(e) => { if (entry.details) e.currentTarget.style.background = "var(--hover-bg)"; }}
                onMouseLeave={(e) => { if (entry.details) e.currentTarget.style.background = "transparent"; }}
              >
                <span style={{ fontSize: "11px", color: "var(--fg-subtle)" }}>
                  {formatTimestamp(entry.timestamp)}
                </span>
                <EventBadge eventType={entry.eventType} />
                <span style={{ fontSize: "12px", color: "var(--fg-base)" }}>
                  {entry.summary}
                </span>
                <span style={{ fontSize: "11px", color: "var(--fg-subtle)" }}>
                  {entry.source}
                </span>
              </div>

              {/* Expanded details */}
              {expandedId === entry.id && entry.details && (
                <div style={{
                  padding: "10px 16px", borderBottom: "1px solid var(--separator)",
                  background: "var(--bg-base)",
                }}>
                  <pre style={{
                    fontSize: "11px", fontFamily: "ui-monospace, monospace",
                    color: "var(--fg-muted)", margin: 0, whiteSpace: "pre-wrap",
                    wordBreak: "break-word", lineHeight: 1.5,
                  }}>
                    {(() => {
                      try {
                        return JSON.stringify(JSON.parse(entry.details!), null, 2);
                      } catch {
                        return entry.details;
                      }
                    })()}
                  </pre>
                </div>
              )}
            </div>
          ))
        )}
      </Card>

      {/* Pagination */}
      {!loading && entries.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "12px", marginTop: "12px" }}>
          <Button variant="ghost" size="sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
            Prev
          </Button>
          <span style={{ fontSize: "11px", color: "var(--fg-subtle)" }}>
            Page {page + 1}
          </span>
          <Button variant="ghost" size="sm" onClick={() => setPage((p) => p + 1)} disabled={entries.length < PAGE_SIZE}>
            Next
          </Button>
        </div>
      )}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={[
            ...(contextMenu.entry.details ? [{ label: "Copy details", onClick: () => navigator.clipboard.writeText(contextMenu.entry.details!) }] : []),
            { label: "Copy summary", onClick: () => navigator.clipboard.writeText(contextMenu.entry.summary) },
          ]}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
