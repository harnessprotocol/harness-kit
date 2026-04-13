import type { Task, TaskPriority } from "../../lib/board-api";
import { COLUMN_META } from "../../lib/board-columns";
import { CATEGORY_CONFIG, COMPLEXITY_CONFIG } from "../../lib/board-task-meta";
import { openInClaudeCode } from "../../lib/open-in-claude";
import { AgentExecutionBadge } from "../agent/AgentExecutionBadge";
import { ProgressBar } from "./ProgressBar";
import { Tooltip } from "./Tooltip";

interface Props {
  task: Task;
  onClick?: () => void;
  repoUrl?: string;
}

const PRIORITY_CONFIG: Record<
  TaskPriority,
  { label: string; color: string; bg: string; border: string }
> = {
  critical: {
    label: "Critical",
    color: "#dc2626",
    bg: "rgba(239,68,68,0.1)",
    border: "rgba(239,68,68,0.2)",
  },
  high: {
    label: "High",
    color: "#ea580c",
    bg: "rgba(249,115,22,0.1)",
    border: "rgba(249,115,22,0.2)",
  },
  medium: {
    label: "Medium",
    color: "#ca8a04",
    bg: "rgba(234,179,8,0.1)",
    border: "rgba(234,179,8,0.2)",
  },
  low: {
    label: "Low",
    color: "var(--text-muted)",
    bg: "rgba(107,114,128,0.1)",
    border: "rgba(107,114,128,0.2)",
  },
};

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  const diffMonth = Math.floor(diffDay / 30);
  return `${diffMonth}mo ago`;
}

export function TaskCard({ task, onClick, repoUrl }: Props) {
  const statusMeta = COLUMN_META[task.status];
  const priorityCfg = task.priority ? PRIORITY_CONFIG[task.priority] : null;
  const completedSubtasks = task.subtasks?.filter((s) => s.status === "completed").length ?? 0;
  const totalSubtasks = task.subtasks?.length ?? 0;
  const categoryCfg = task.category ? CATEGORY_CONFIG[task.category] : null;
  const complexityCfg = task.complexity ? COMPLEXITY_CONFIG[task.complexity] : null;

  return (
    <div
      onClick={onClick}
      style={{
        background: "var(--bg-elevated)",
        border: `1px solid ${task.blocked ? "var(--blocked)" : "var(--border)"}`,
        borderRadius: 8,
        padding: 10,
        cursor: "pointer",
        transition: "border-color 0.1s, background 0.1s",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = task.blocked
          ? "var(--blocked)"
          : "var(--accent)";
        (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = task.blocked
          ? "var(--blocked)"
          : "var(--border)";
        (e.currentTarget as HTMLElement).style.background = "var(--bg-elevated)";
      }}
    >
      {/* Header: title + id */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <span
          style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.4, color: "var(--text-primary)" }}
        >
          {task.title}
        </span>
        <span style={{ fontSize: 11, color: "var(--text-muted)", flexShrink: 0 }}>#{task.id}</span>
      </div>

      {/* Agent execution badge — shown when running with a phase */}
      {task.execution?.status === "running" && task.execution.phase && (
        <AgentExecutionBadge
          phase={task.execution.phase}
          progress={0}
          taskId={task.execution.thread_id ? task.id : undefined}
        />
      )}

      {/* Description preview */}
      {task.description && (
        <p
          style={{
            margin: 0,
            fontSize: 11,
            lineHeight: 1.6,
            color: "var(--text-secondary)",
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
          }}
        >
          {task.description}
        </p>
      )}

      {/* Badges row: status, priority, epic */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
        {/* Status badge */}
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            borderRadius: 9999,
            border: "1px solid var(--border-subtle)",
            background: "var(--bg-surface)",
            padding: "1px 6px",
            fontSize: 10,
            fontWeight: 500,
            color: "var(--text-muted)",
          }}
        >
          <span
            style={{
              display: "inline-block",
              width: 6,
              height: 6,
              borderRadius: "50%",
              backgroundColor: statusMeta?.color,
            }}
          />
          {statusMeta?.label ?? task.status}
        </span>

        {/* Priority label */}
        {priorityCfg && (
          <span
            style={{
              borderRadius: 9999,
              border: `1px solid ${priorityCfg.border}`,
              background: priorityCfg.bg,
              color: priorityCfg.color,
              padding: "1px 6px",
              fontSize: 10,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            {priorityCfg.label}
          </span>
        )}

        {/* Epic badge */}
        {task.epic_name && (
          <span
            style={{
              borderRadius: 9999,
              border: "1px solid var(--border-subtle)",
              background: "var(--bg-surface)",
              padding: "1px 6px",
              fontSize: 11,
              color: "var(--text-muted)",
            }}
          >
            {task.epic_name}
          </span>
        )}

        {/* Category badge */}
        {categoryCfg && (
          <span
            style={{
              borderRadius: 9999,
              border: `1px solid ${categoryCfg.color}33`,
              background: `${categoryCfg.color}15`,
              color: categoryCfg.color,
              padding: "1px 6px",
              fontSize: 10,
              fontWeight: 500,
            }}
          >
            {categoryCfg.label}
          </span>
        )}

        {/* Complexity badge */}
        {complexityCfg && (
          <span
            style={{
              borderRadius: 9999,
              border: "1px solid var(--border-subtle)",
              background: "var(--bg-surface)",
              padding: "1px 6px",
              fontSize: 10,
              color: "var(--text-muted)",
              fontWeight: 500,
            }}
          >
            {complexityCfg.label}
          </span>
        )}
      </div>

      {/* Progress bar */}
      {totalSubtasks > 0 && <ProgressBar completed={completedSubtasks} total={totalSubtasks} />}

      {/* Subtask status dots */}
      {totalSubtasks > 0 && totalSubtasks <= 10 && (
        <Tooltip text={`${completedSubtasks}/${totalSubtasks} subtasks complete`} position="top">
          <span style={{ display: "inline-flex", gap: 3, alignItems: "center" }}>
            {task.subtasks.map((s) => (
              <span
                key={s.id}
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background:
                    s.status === "completed"
                      ? "var(--success)"
                      : s.status === "in_progress"
                        ? "var(--status-in-progress)"
                        : s.status === "failed"
                          ? "var(--danger, #ef4444)"
                          : "var(--fg-subtle)",
                }}
              />
            ))}
          </span>
        </Tooltip>
      )}

      {/* Footer row */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
        {/* Blocked indicator */}
        {task.blocked && (
          <Tooltip text="Blocked — click to see reason" position="top">
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: "var(--blocked)",
                background: "rgba(220, 38, 38, 0.1)",
                borderRadius: 4,
                padding: "1px 5px",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              Blocked
            </span>
          </Tooltip>
        )}

        {/* Branch */}
        {task.branch &&
          (repoUrl ? (
            <a
              href={`${repoUrl}/tree/${task.branch}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={{
                fontSize: 11,
                color: "var(--text-muted)",
                fontFamily: "monospace",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                maxWidth: 140,
                textDecoration: "none",
              }}
              onMouseEnter={(e) => {
                (e.target as HTMLElement).style.color = "var(--accent)";
              }}
              onMouseLeave={(e) => {
                (e.target as HTMLElement).style.color = "var(--text-muted)";
              }}
            >
              {task.branch}
            </a>
          ) : (
            <span
              style={{
                fontSize: 11,
                color: "var(--text-muted)",
                fontFamily: "monospace",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                maxWidth: 140,
              }}
            >
              {task.branch}
            </span>
          ))}

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Comment count */}
        {task.comments.length > 0 && (
          <Tooltip text={`${task.comments.length} comment(s) — click to view`} position="top">
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: 3,
                fontSize: 11,
                color: "var(--text-muted)",
              }}
            >
              {task.comments.length}
            </span>
          </Tooltip>
        )}

        {/* Relative timestamp */}
        <Tooltip text={new Date(task.updated_at).toLocaleString()} position="top">
          <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
            {relativeTime(task.updated_at)}
          </span>
        </Tooltip>

        {/* Open in Claude Code */}
        {(["backlog", "planning", "in-progress"] as string[]).includes(task.status) && (
          <Tooltip text="Open in Claude Code" position="top">
            <button
              onClick={(e) => {
                e.stopPropagation();
                openInClaudeCode(task);
              }}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--fg-subtle, var(--text-muted))",
                cursor: "pointer",
                fontSize: 12,
                lineHeight: 1,
                padding: 2,
                borderRadius: 4,
                display: "inline-flex",
                alignItems: "center",
                transition: "color 0.15s",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.color = "var(--accent)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.color =
                  "var(--fg-subtle, var(--text-muted))";
              }}
            >
              {"\u25B6"}
            </button>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
