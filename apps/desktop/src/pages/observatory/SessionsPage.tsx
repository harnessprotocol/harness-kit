import { useEffect, useState } from "react";
import { listSessionsSummary, readSessionFacet } from "../../lib/tauri";
import { formatTimestamp, formatDuration, formatNumber } from "../../lib/format";
import type { SessionSummary, SessionFacet } from "@harness-kit/shared";

// ── Outcome badge ──────────────────────────────────────────────

const OUTCOME_COLORS: Record<string, { bg: string; color: string }> = {
  fully_achieved:    { bg: "rgba(22,163,74,0.12)",  color: "#16a34a" },
  mostly_achieved:   { bg: "rgba(13,148,136,0.12)", color: "#0f766e" },
  partially_achieved: { bg: "rgba(217,119,6,0.12)",  color: "#d97706" },
  not_achieved:      { bg: "rgba(220,38,38,0.12)",  color: "#dc2626" },
};

function OutcomeBadge({ outcome }: { outcome: string }) {
  const style = OUTCOME_COLORS[outcome] ?? { bg: "var(--bg-base)", color: "var(--fg-subtle)" };
  const label = outcome.replace(/_/g, " ");
  return (
    <span style={{
      fontSize: "10px",
      fontWeight: 500,
      padding: "1px 7px",
      borderRadius: "10px",
      background: style.bg,
      color: style.color,
      textTransform: "capitalize",
    }}>
      {label}
    </span>
  );
}

// ── Helpfulness badge ──────────────────────────────────────────

function HelpfulnessBadge({ value }: { value: string }) {
  const label = value.replace(/_/g, " ");
  return (
    <span style={{
      fontSize: "10px",
      fontWeight: 400,
      padding: "1px 7px",
      borderRadius: "10px",
      border: "1px solid var(--border-base)",
      color: "var(--fg-subtle)",
      textTransform: "capitalize",
    }}>
      {label}
    </span>
  );
}

// ── Project pill ───────────────────────────────────────────────

function ProjectPill({ name }: { name: string }) {
  return (
    <span style={{
      fontSize: "10px",
      fontWeight: 400,
      padding: "2px 7px",
      borderRadius: "10px",
      border: "1px solid var(--border-base)",
      color: "var(--fg-muted)",
      background: "var(--bg-base)",
      maxWidth: "160px",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      display: "inline-block",
    }}>
      {name}
    </span>
  );
}

// ── Facet detail panel ─────────────────────────────────────────

function FacetDetail({ facet, loading }: { facet: SessionFacet | null; loading: boolean }) {
  if (loading) {
    return (
      <div style={{ padding: "10px 14px 12px 28px", borderTop: "1px solid var(--separator)" }}>
        <p style={{ fontSize: "11px", color: "var(--fg-subtle)", margin: 0 }}>Loading insights…</p>
      </div>
    );
  }

  if (!facet) {
    return (
      <div style={{ padding: "10px 14px 12px 28px", borderTop: "1px solid var(--separator)" }}>
        <p style={{ fontSize: "11px", color: "var(--fg-subtle)", margin: 0 }}>No insights available for this session.</p>
      </div>
    );
  }

  const hasFriction = facet.friction_counts && Object.keys(facet.friction_counts).length > 0;

  return (
    <div style={{ padding: "10px 14px 12px 28px", borderTop: "1px solid var(--separator)", background: "var(--bg-base)" }}>
      {facet.brief_summary && (
        <p style={{ fontSize: "12px", color: "var(--fg-muted)", margin: "0 0 8px", lineHeight: 1.5 }}>
          {facet.brief_summary}
        </p>
      )}

      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center", marginBottom: facet.underlying_goal ? "8px" : 0 }}>
        {facet.outcome && <OutcomeBadge outcome={facet.outcome} />}
        {facet.claude_helpfulness && <HelpfulnessBadge value={facet.claude_helpfulness} />}
        {facet.session_type && (
          <span style={{ fontSize: "10px", color: "var(--fg-subtle)", textTransform: "capitalize" }}>
            {facet.session_type.replace(/_/g, " ")}
          </span>
        )}
      </div>

      {facet.underlying_goal && (
        <p style={{ fontSize: "11px", color: "var(--fg-subtle)", margin: "0 0 6px" }}>
          <span style={{ fontWeight: 500, color: "var(--fg-muted)" }}>Goal:</span> {facet.underlying_goal}
        </p>
      )}

      {hasFriction && (
        <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
          {Object.entries(facet.friction_counts!).map(([type, count]) => (
            <span key={type} style={{
              fontSize: "10px",
              padding: "1px 6px",
              borderRadius: "4px",
              background: "rgba(220,38,38,0.08)",
              color: "var(--danger)",
            }}>
              {type.replace(/_/g, " ")} ×{count}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────

export default function SessionsPage() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [facet, setFacet] = useState<SessionFacet | null>(null);
  const [facetLoading, setFacetLoading] = useState(false);

  useEffect(() => {
    listSessionsSummary()
      .then(setSessions)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  function handleRowClick(sessionId: string) {
    if (expandedId === sessionId) {
      setExpandedId(null);
      setFacet(null);
      return;
    }
    setExpandedId(sessionId);
    setFacet(null);
    setFacetLoading(true);
    readSessionFacet(sessionId)
      .then(setFacet)
      .catch(() => setFacet(null))
      .finally(() => setFacetLoading(false));
  }

  const projectCount = new Set(sessions.map((s) => s.project_short).filter(Boolean)).size;

  return (
    <div style={{ padding: "20px 24px" }}>
      {/* Header */}
      <div style={{ marginBottom: "16px" }}>
        <h1 style={{ fontSize: "17px", fontWeight: 600, letterSpacing: "-0.3px", color: "var(--fg-base)", margin: 0 }}>
          Sessions
        </h1>
        {!loading && !error && (
          <p style={{ fontSize: "12px", color: "var(--fg-muted)", margin: "3px 0 0" }}>
            {formatNumber(sessions.length)} {sessions.length === 1 ? "session" : "sessions"} across {projectCount} {projectCount === 1 ? "project" : "projects"}
          </p>
        )}
      </div>

      {loading && (
        <p style={{ fontSize: "13px", color: "var(--fg-subtle)" }}>Loading…</p>
      )}

      {error && (
        <div style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-base)",
          borderRadius: "8px",
          padding: "10px 14px",
          fontSize: "13px",
          color: "var(--danger)",
        }}>
          {error}
        </div>
      )}

      {!loading && !error && sessions.length === 0 && (
        <div style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-base)",
          borderRadius: "8px",
          padding: "32px 16px",
          textAlign: "center",
        }}>
          <p style={{ fontSize: "13px", color: "var(--fg-muted)", margin: 0 }}>No sessions found.</p>
          <p style={{ fontSize: "11px", color: "var(--fg-subtle)", margin: "4px 0 0" }}>
            Sessions are read from <code style={{ fontFamily: "ui-monospace, monospace", fontSize: "10px" }}>~/.claude/history.jsonl</code>
          </p>
        </div>
      )}

      {!loading && !error && sessions.length > 0 && (
        <div className="row-list">
          {sessions.map((session) => {
            const isExpanded = expandedId === session.session_id;
            const duration = session.last_timestamp - session.first_timestamp;

            return (
              <div key={session.session_id}>
                <button
                  className="row-list-item"
                  onClick={() => handleRowClick(session.session_id)}
                  style={{
                    width: "100%",
                    justifyContent: "space-between",
                    background: isExpanded ? "var(--hover-bg)" : undefined,
                    cursor: "pointer",
                    border: "none",
                    textAlign: "left",
                  }}
                >
                  {/* Left: timestamp */}
                  <div style={{ minWidth: "160px" }}>
                    <span style={{ fontSize: "12px", color: "var(--fg-muted)", fontVariantNumeric: "tabular-nums" }}>
                      {formatTimestamp(session.first_timestamp)}
                    </span>
                  </div>

                  {/* Middle: project */}
                  <div style={{ flex: 1, padding: "0 12px" }}>
                    {session.project_short && <ProjectPill name={session.project_short} />}
                  </div>

                  {/* Right: count + duration */}
                  <div style={{ display: "flex", gap: "10px", alignItems: "center", flexShrink: 0 }}>
                    <span style={{ fontSize: "11px", color: "var(--fg-subtle)" }}>
                      {formatNumber(session.message_count)} msgs
                    </span>
                    {duration > 60_000 && (
                      <span style={{ fontSize: "11px", color: "var(--fg-subtle)" }}>
                        {formatDuration(duration)}
                      </span>
                    )}
                    <svg
                      width="10" height="10"
                      viewBox="0 0 10 10"
                      fill="none"
                      style={{ color: "var(--fg-subtle)", transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.15s" }}
                    >
                      <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                </button>

                {isExpanded && (
                  <FacetDetail facet={facet} loading={facetLoading} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
