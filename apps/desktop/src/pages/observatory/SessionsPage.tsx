import type {
  SessionFacet,
  SessionSummary,
  SessionTranscript,
  TranscriptEntry,
} from "@harness-kit/shared";
import { useEffect, useState } from "react";
import ContextMenu from "../../components/ContextMenu";
import { useArrowNavigation } from "../../hooks/useArrowNavigation";
import { formatDuration, formatNumber, formatTimestamp, shortModelName } from "../../lib/format";
import { listSessionsSummary, readSessionFacet, readSessionTranscript } from "../../lib/tauri";

// ── Outcome badge ──────────────────────────────────────────────

const OUTCOME_COLORS: Record<string, { bg: string; color: string }> = {
  fully_achieved: { bg: "rgba(22,163,74,0.12)", color: "#16a34a" },
  mostly_achieved: { bg: "rgba(13,148,136,0.12)", color: "#0f766e" },
  partially_achieved: { bg: "rgba(217,119,6,0.12)", color: "#d97706" },
  not_achieved: { bg: "rgba(220,38,38,0.12)", color: "#dc2626" },
};

function OutcomeBadge({ outcome }: { outcome: string }) {
  const style = OUTCOME_COLORS[outcome] ?? { bg: "var(--bg-base)", color: "var(--fg-subtle)" };
  const label = outcome.replace(/_/g, " ");
  return (
    <span
      style={{
        fontSize: "10px",
        fontWeight: 500,
        padding: "1px 7px",
        borderRadius: "10px",
        background: style.bg,
        color: style.color,
        textTransform: "capitalize",
      }}
    >
      {label}
    </span>
  );
}

// ── Helpfulness badge ──────────────────────────────────────────

function HelpfulnessBadge({ value }: { value: string }) {
  const label = value.replace(/_/g, " ");
  return (
    <span
      style={{
        fontSize: "10px",
        fontWeight: 400,
        padding: "1px 7px",
        borderRadius: "10px",
        border: "1px solid var(--border-base)",
        color: "var(--fg-subtle)",
        textTransform: "capitalize",
      }}
    >
      {label}
    </span>
  );
}

// ── Project pill ───────────────────────────────────────────────

function ProjectPill({ name }: { name: string }) {
  return (
    <span
      style={{
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
      }}
    >
      {name}
    </span>
  );
}

// ── Role colors ────────────────────────────────────────────────

const ROLE_COLORS: Record<string, string> = {
  user: "#2563eb",
  assistant: "#5b50e8",
  system: "#636366",
  result: "#0d9488",
};

// ── Transcript entry row ──────────────────────────────────────

function TranscriptRow({ entry }: { entry: TranscriptEntry }) {
  const roleColor = ROLE_COLORS[entry.role] ?? "var(--fg-subtle)";
  const time = entry.timestamp
    ? new Date(entry.timestamp).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "";

  const isAssistant = entry.role === "assistant";

  return (
    <div
      style={{
        display: "flex",
        gap: "8px",
        padding: isAssistant ? "5px 0 5px 0" : "4px 0",
        borderBottom: "1px solid var(--separator)",
        fontSize: "11px",
        opacity: entry.isSubagent ? 0.7 : 1,
        borderLeft: `2px solid ${roleColor}`,
        paddingLeft: "8px",
        marginLeft: entry.isSubagent ? "12px" : 0,
      }}
    >
      {/* Time */}
      <span
        style={{
          minWidth: "56px",
          color: "var(--fg-subtle)",
          fontVariantNumeric: "tabular-nums",
          flexShrink: 0,
          fontSize: "10px",
        }}
      >
        {time}
      </span>

      {/* Role badge */}
      <span
        style={{
          minWidth: "52px",
          flexShrink: 0,
          fontWeight: 600,
          fontSize: "10px",
          color: roleColor,
          textTransform: "uppercase",
          letterSpacing: "0.03em",
        }}
      >
        {entry.isSubagent ? `\u21B3 ${entry.role}` : entry.role}
      </span>

      {/* Model */}
      {entry.model && (
        <span
          style={{
            fontSize: "9px",
            padding: "1px 6px",
            borderRadius: "4px",
            background: "rgba(91,80,232,0.10)",
            color: "var(--accent-text)",
            flexShrink: 0,
            alignSelf: "center",
            fontWeight: 500,
          }}
        >
          {shortModelName(entry.model)}
        </span>
      )}

      {/* Tool chips */}
      {entry.toolNames.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: "3px",
            flexWrap: "wrap",
            flexShrink: 0,
            alignItems: "center",
          }}
        >
          {entry.toolNames.slice(0, 5).map((name, i) => (
            <span
              key={i}
              style={{
                fontSize: "9px",
                padding: "1px 5px",
                borderRadius: "4px",
                background: "rgba(13,148,136,0.10)",
                color: "#0d9488",
                fontWeight: 500,
              }}
            >
              {name}
            </span>
          ))}
          {entry.toolNames.length > 5 && (
            <span style={{ fontSize: "9px", color: "var(--fg-subtle)" }}>
              +{entry.toolNames.length - 5}
            </span>
          )}
        </div>
      )}

      {/* Token count */}
      {(entry.inputTokens || entry.outputTokens) && (
        <span
          style={{
            fontSize: "9px",
            color: "var(--fg-subtle)",
            flexShrink: 0,
            alignSelf: "center",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {entry.outputTokens ? `${formatNumber(entry.outputTokens)} tok` : ""}
        </span>
      )}

      {/* Content preview */}
      {entry.contentPreview && (
        <span
          style={{
            color: "var(--fg-muted)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flex: 1,
            minWidth: 0,
            fontSize: "10px",
          }}
        >
          {entry.contentPreview}
        </span>
      )}
    </div>
  );
}

// ── Session detail panel ──────────────────────────────────────

function SessionDetail({
  session,
  facet,
  facetLoading,
}: {
  session: SessionSummary;
  facet: SessionFacet | null;
  facetLoading: boolean;
}) {
  const [transcript, setTranscript] = useState<SessionTranscript | null>(null);
  const [transcriptLoading, setTranscriptLoading] = useState(true);

  useEffect(() => {
    setTranscriptLoading(true);
    setTranscript(null);
    readSessionTranscript(session.sessionId, session.project)
      .then(setTranscript)
      .catch(() => setTranscript(null))
      .finally(() => setTranscriptLoading(false));
  }, [session.sessionId, session.project]);

  return (
    <div
      style={{
        padding: "10px 14px 12px 28px",
        borderTop: "1px solid var(--separator)",
        background: "var(--bg-base)",
      }}
    >
      {/* Facet summary header */}
      {facetLoading && (
        <p style={{ fontSize: "11px", color: "var(--fg-subtle)", margin: "0 0 8px" }}>
          Loading insights…
        </p>
      )}
      {facet && (
        <div style={{ marginBottom: "10px" }}>
          {facet.brief_summary && (
            <p
              style={{
                fontSize: "12px",
                color: "var(--fg-muted)",
                margin: "0 0 6px",
                lineHeight: 1.5,
              }}
            >
              {facet.brief_summary}
            </p>
          )}
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
            {facet.outcome && <OutcomeBadge outcome={facet.outcome} />}
            {facet.claude_helpfulness && <HelpfulnessBadge value={facet.claude_helpfulness} />}
            {facet.session_type && (
              <span
                style={{ fontSize: "10px", color: "var(--fg-subtle)", textTransform: "capitalize" }}
              >
                {facet.session_type.replace(/_/g, " ")}
              </span>
            )}
          </div>
          {facet.underlying_goal && (
            <p style={{ fontSize: "11px", color: "var(--fg-subtle)", margin: "6px 0 0" }}>
              <span style={{ fontWeight: 500, color: "var(--fg-muted)" }}>Goal:</span>{" "}
              {facet.underlying_goal}
            </p>
          )}
        </div>
      )}

      {/* Transcript stats header */}
      {transcript && transcript.entries.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: "14px",
            padding: "8px 10px",
            marginBottom: "8px",
            borderRadius: "6px",
            background: "var(--hover-bg)",
            fontSize: "10px",
            color: "var(--fg-muted)",
            fontWeight: 500,
          }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <span style={{ color: "#ea580c" }}>{formatNumber(transcript.totalOutputTokens)}</span>{" "}
            tokens out
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <span style={{ color: "#0d9488" }}>{formatNumber(transcript.totalToolCalls)}</span> tool
            calls
          </span>
          <span>{transcript.modelsUsed.map(shortModelName).join(", ")}</span>
          {transcript.subagentCount > 0 && (
            <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <span style={{ color: "#5b50e8" }}>{transcript.subagentCount}</span> subagent
              {transcript.subagentCount > 1 ? "s" : ""}
            </span>
          )}
          {transcript.truncated && <span style={{ color: "var(--warning)" }}>truncated</span>}
        </div>
      )}

      {/* Transcript timeline */}
      {transcriptLoading && (
        <p style={{ fontSize: "11px", color: "var(--fg-subtle)", margin: 0 }}>
          Loading transcript…
        </p>
      )}
      {!transcriptLoading && transcript && transcript.entries.length > 0 && (
        <div style={{ maxHeight: "400px", overflowY: "auto" }}>
          {transcript.entries.map((entry, i) => (
            <TranscriptRow key={i} entry={entry} />
          ))}
        </div>
      )}
      {!transcriptLoading && (!transcript || transcript.entries.length === 0) && !facet && (
        <p style={{ fontSize: "11px", color: "var(--fg-subtle)", margin: 0 }}>
          No transcript or insights available for this session.
        </p>
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
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    session: SessionSummary;
  } | null>(null);

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

  const { focusedIndex, onKeyDown: onListKeyDown } = useArrowNavigation({
    count: sessions.length,
    onActivate: (i) => handleRowClick(sessions[i].sessionId),
  });

  const projectCount = new Set(sessions.map((s) => s.projectShort).filter(Boolean)).size;

  const expandedSession = sessions.find((s) => s.sessionId === expandedId);

  return (
    <div style={{ padding: "20px 24px" }}>
      {/* Header */}
      <div style={{ marginBottom: "16px" }}>
        <h1
          style={{
            fontSize: "17px",
            fontWeight: 600,
            letterSpacing: "-0.3px",
            color: "var(--fg-base)",
            margin: 0,
          }}
        >
          Sessions
        </h1>
        {!loading && !error && (
          <p style={{ fontSize: "12px", color: "var(--fg-muted)", margin: "3px 0 0" }}>
            {formatNumber(sessions.length)} {sessions.length === 1 ? "session" : "sessions"} across{" "}
            {projectCount} {projectCount === 1 ? "project" : "projects"}
          </p>
        )}
      </div>

      {loading && <p style={{ fontSize: "13px", color: "var(--fg-subtle)" }}>Loading…</p>}

      {error && (
        <div
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-base)",
            borderRadius: "8px",
            padding: "10px 14px",
            fontSize: "13px",
            color: "var(--danger)",
          }}
        >
          {error}
        </div>
      )}

      {!loading && !error && sessions.length === 0 && (
        <div
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-base)",
            borderRadius: "8px",
            padding: "32px 16px",
            textAlign: "center",
          }}
        >
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            style={{ color: "var(--fg-subtle)", marginBottom: "10px" }}
          >
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
            <path
              d="M12 7v5l3 3"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <p style={{ fontSize: "13px", color: "var(--fg-muted)", margin: 0 }}>
            No sessions found.
          </p>
          <p style={{ fontSize: "11px", color: "var(--fg-subtle)", margin: "4px 0 0" }}>
            Sessions are read from{" "}
            <code style={{ fontFamily: "ui-monospace, monospace", fontSize: "10px" }}>
              ~/.claude/history.jsonl
            </code>
          </p>
        </div>
      )}

      {!loading && !error && sessions.length > 0 && (
        <div className="row-list" tabIndex={0} onKeyDown={onListKeyDown}>
          {sessions.map((session, idx) => {
            const isExpanded = expandedId === session.sessionId;
            const duration = session.lastTimestamp - session.firstTimestamp;

            return (
              <div key={session.sessionId}>
                <button
                  className="row-list-item"
                  onClick={() => handleRowClick(session.sessionId)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setContextMenu({ x: e.clientX, y: e.clientY, session });
                  }}
                  style={{
                    width: "100%",
                    justifyContent: "space-between",
                    background: isExpanded ? "var(--hover-bg)" : undefined,
                    cursor: "pointer",
                    border: "none",
                    textAlign: "left",
                    outline: focusedIndex === idx ? "2px solid var(--accent)" : "none",
                    outlineOffset: "-2px",
                  }}
                >
                  {/* Left: timestamp */}
                  <div style={{ minWidth: "160px" }}>
                    <span
                      style={{
                        fontSize: "12px",
                        color: "var(--fg-muted)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {formatTimestamp(session.firstTimestamp)}
                    </span>
                  </div>

                  {/* Middle: project */}
                  <div style={{ flex: 1, padding: "0 12px" }}>
                    {session.projectShort && <ProjectPill name={session.projectShort} />}
                  </div>

                  {/* Right: count + duration */}
                  <div
                    style={{ display: "flex", gap: "10px", alignItems: "center", flexShrink: 0 }}
                  >
                    <span style={{ fontSize: "11px", color: "var(--fg-subtle)" }}>
                      {formatNumber(session.messageCount)} msgs
                    </span>
                    {duration > 60_000 && (
                      <span style={{ fontSize: "11px", color: "var(--fg-subtle)" }}>
                        {formatDuration(duration)}
                      </span>
                    )}
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 10 10"
                      fill="none"
                      style={{
                        color: "var(--fg-subtle)",
                        transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                        transition: "transform 0.15s",
                      }}
                    >
                      <path
                        d="M2 3.5L5 6.5L8 3.5"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                </button>

                {isExpanded && expandedSession && (
                  <SessionDetail
                    session={expandedSession}
                    facet={facet}
                    facetLoading={facetLoading}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={[
            { label: "View details", onClick: () => handleRowClick(contextMenu.session.sessionId) },
            {
              label: "Copy session ID",
              onClick: () => navigator.clipboard.writeText(contextMenu.session.sessionId),
            },
          ]}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
