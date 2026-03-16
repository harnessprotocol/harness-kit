import { useEffect, useState, useCallback } from "react";
import { listAuditEntries, clearAuditEntries } from "../../lib/tauri";
import type { AuditEntry } from "@harness-kit/shared";
import { useArrowNavigation } from "../../hooks/useArrowNavigation";

const PAGE_SIZE = 25;

type CategoryFilter = "all" | "permissions" | "secrets";

function Pill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      style={{
        fontSize: "11px",
        fontWeight: active ? 600 : 400,
        padding: "3px 10px",
        borderRadius: "12px",
        border: "1px solid",
        borderColor: active ? "var(--accent)" : "var(--border-base)",
        background: active ? "var(--accent-light)" : "transparent",
        color: active ? "var(--accent-text)" : "var(--fg-muted)",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

function EventBadge({ eventType }: { eventType: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    permission_change: { bg: "rgba(91,80,232,0.1)", text: "var(--accent-text)" },
    preset_applied: { bg: "rgba(22,163,74,0.1)", text: "#16a34a" },
    secret_access: { bg: "rgba(217,119,6,0.1)", text: "#d97706" },
    secret_delete: { bg: "rgba(220,38,38,0.1)", text: "#dc2626" },
  };
  const c = colors[eventType] ?? { bg: "var(--bg-base)", text: "var(--fg-muted)" };
  const label = eventType.replace(/_/g, " ");

  return (
    <span style={{
      fontSize: "10px", fontWeight: 500, padding: "1px 7px",
      borderRadius: "4px", background: c.bg, color: c.text,
      whiteSpace: "nowrap",
    }}>
      {label}
    </span>
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
        <div style={{
          background: "var(--bg-surface)", border: "1px solid var(--border-base)",
          borderRadius: "8px", padding: "10px 14px", fontSize: "13px",
          color: "var(--danger)", marginBottom: "16px",
        }}>
          {error}
        </div>
      )}

      {/* Filter bar */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
        <Pill label="All" active={filter === "all"} onClick={() => handleFilterChange("all")} />
        <Pill label="Permissions" active={filter === "permissions"} onClick={() => handleFilterChange("permissions")} />
        <Pill label="Secrets" active={filter === "secrets"} onClick={() => handleFilterChange("secrets")} />

        <div style={{ flex: 1 }} />

        {!confirmClear ? (
          <button
            onClick={() => setConfirmClear(true)}
            style={{
              fontSize: "11px", padding: "3px 10px", borderRadius: "5px",
              border: "1px solid var(--border-base)", background: "transparent",
              color: "var(--fg-muted)", cursor: "pointer",
            }}
          >
            Clear old entries
          </button>
        ) : (
          <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
            <span style={{ fontSize: "11px", color: "var(--fg-muted)" }}>
              Clear entries older than 30 days?
            </span>
            <button
              onClick={handleClear}
              style={{
                fontSize: "11px", padding: "2px 8px", borderRadius: "4px",
                border: "none", background: "var(--danger)", color: "#fff",
                cursor: "pointer",
              }}
            >
              Confirm
            </button>
            <button
              onClick={() => setConfirmClear(false)}
              style={{
                fontSize: "11px", padding: "2px 8px", borderRadius: "4px",
                border: "1px solid var(--border-base)", background: "transparent",
                color: "var(--fg-muted)", cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div
        tabIndex={0}
        onKeyDown={onAuditKeyDown}
        style={{
          background: "var(--bg-surface)", border: "1px solid var(--border-base)",
          borderRadius: "8px", overflow: "hidden",
        }}
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
          <div style={{ padding: "24px 16px", textAlign: "center" }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" style={{ color: "var(--fg-subtle)", marginBottom: "10px" }}>
              <path d="M12 3L4 6v6c0 4.418 3.582 8 8 9 4.418-1 8-4.582 8-9V6l-8-3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
            </svg>
            <p style={{ fontSize: "13px", color: "var(--fg-muted)", margin: 0 }}>
              No audit entries found.
            </p>
            <p style={{ fontSize: "11px", color: "var(--fg-subtle)", margin: "4px 0 0" }}>
              Entries are created when permissions or secrets are modified.
            </p>
          </div>
        ) : (
          entries.map((entry, idx) => (
            <div key={entry.id}>
              <div
                onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
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
      </div>

      {/* Pagination */}
      {!loading && entries.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "12px", marginTop: "12px" }}>
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            style={{
              fontSize: "11px", padding: "4px 10px", borderRadius: "5px",
              border: "1px solid var(--border-base)", background: "transparent",
              color: page === 0 ? "var(--fg-subtle)" : "var(--fg-muted)",
              cursor: page === 0 ? "default" : "pointer",
            }}
          >
            Prev
          </button>
          <span style={{ fontSize: "11px", color: "var(--fg-subtle)" }}>
            Page {page + 1}
          </span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={entries.length < PAGE_SIZE}
            style={{
              fontSize: "11px", padding: "4px 10px", borderRadius: "5px",
              border: "1px solid var(--border-base)", background: "transparent",
              color: entries.length < PAGE_SIZE ? "var(--fg-subtle)" : "var(--fg-muted)",
              cursor: entries.length < PAGE_SIZE ? "default" : "pointer",
            }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
