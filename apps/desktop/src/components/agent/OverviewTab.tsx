// apps/desktop/src/components/agent/OverviewTab.tsx
// Ported from docs/plans/agent-ui-mock.html:
// .overview-body, .phase-timeline, .phase-step, .phase-circle, .phase-name,
// .current-subtask-box, .csb-spinner, .steering-box, .steering-input, .send-btn,
// .control-btns, .ctrl-btn

import type React from "react";
import { useState } from "react";
import { agentApi } from "../../lib/agent-api";
import type { Task } from "../../lib/board-api";
import { api } from "../../lib/board-api";

const PHASES = ["spec", "planning", "coding", "qa_review", "done"] as const;

const PHASE_LABELS: Record<string, string> = {
  spec: "Spec",
  planning: "Plan",
  coding: "Code",
  qa_review: "QA",
  done: "Done",
};

// All possible phases in order (for index comparison)
const ALL_PHASES = ["spec", "planning", "coding", "qa_review", "qa_fixing"];

interface Props {
  task: Task;
  projectSlug: string;
  currentPhase: string | null;
  onTaskUpdated?: () => void;
}

export function OverviewTab({ task, projectSlug, currentPhase, onTaskUpdated }: Props) {
  const [steering, setSteering] = useState("");
  const [sending, setSending] = useState(false);
  const [steerError, setSteerError] = useState<string | null>(null);

  const curIdx = ALL_PHASES.indexOf(currentPhase ?? "");
  const active = task.subtasks.find((s) => s.status === "in_progress");
  const isPaused = task.execution?.status === "paused";

  const serialTask = {
    id: task.id,
    title: task.title,
    description: task.description,
    subtasks: task.subtasks.map((s) => ({
      id: s.id,
      title: s.title,
      status: s.status,
      phase: s.phase,
    })),
    worktree_path: task.worktree_path,
    default_model: task.default_model,
  };

  const handleSteer = async () => {
    if (!steering.trim() || sending) return;
    setSending(true);
    setSteerError(null);
    try {
      const res = await agentApi.steer(projectSlug, task.id, serialTask, steering);
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      setSteering("");
    } catch (err) {
      setSteerError(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setSending(false);
    }
  };

  const handlePause = async () => {
    await agentApi.pause(projectSlug, task.id);
    await api.tasks
      .updateExecution(projectSlug, task.id, { status: "paused" })
      .catch(console.error);
    onTaskUpdated?.();
  };

  const handleResume = async () => {
    await agentApi.resume(projectSlug, serialTask);
    await api.tasks
      .updateExecution(projectSlug, task.id, {
        status: "running",
        phase: currentPhase ?? "coding",
      })
      .catch(console.error);
    onTaskUpdated?.();
  };

  return (
    // .overview-body
    <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Phase timeline */}
      <div>
        <div
          style={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: ".1em",
            color: "#455270",
            textTransform: "uppercase",
            marginBottom: 10,
          }}
        >
          Phase Progress
        </div>
        {/* .phase-timeline */}
        <div style={{ display: "flex", alignItems: "flex-start" }}>
          {PHASES.map((p, i) => {
            const realIdx = ALL_PHASES.indexOf(p);
            const isDone = realIdx < curIdx || (p === "done" && currentPhase === "done");
            const isActive = p === currentPhase || (realIdx === curIdx && p !== "done");

            // .phase-circle
            const circleStyle: React.CSSProperties = {
              width: 22,
              height: 22,
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 9,
              zIndex: 1,
              position: "relative",
              fontFamily: "JetBrains Mono, monospace",
              transition: "all .3s",
              ...(isDone
                ? {
                    background: "rgba(52,211,153,.2)",
                    border: "1.5px solid #34D399",
                    color: "#34D399",
                  }
                : isActive
                  ? {
                      background: "rgba(75,158,255,.15)",
                      border: "1.5px solid #4B9EFF",
                      color: "#4B9EFF",
                    }
                  : { background: "#161E2E", border: "1.5px solid #253352", color: "#455270" }),
            };

            // .phase-name
            const nameColor = isDone ? "#34D399" : isActive ? "#4B9EFF" : "#455270";

            return (
              // .phase-step
              <div
                key={p}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 4,
                  flex: 1,
                  position: "relative",
                }}
              >
                <div style={circleStyle}>{isDone ? "✓" : isActive ? "◉" : String(i + 1)}</div>
                <div
                  style={{
                    fontSize: 10,
                    fontFamily: "JetBrains Mono, monospace",
                    textAlign: "center",
                    color: nameColor,
                    letterSpacing: ".03em",
                  }}
                >
                  {PHASE_LABELS[p]}
                </div>
                {/* Connector line — pseudoelement replacement */}
                {i < PHASES.length - 1 && (
                  <div
                    style={{
                      position: "absolute",
                      top: 11,
                      left: "50%",
                      width: "100%",
                      height: 1,
                      zIndex: 0,
                      background: isDone
                        ? "#34D399"
                        : isActive
                          ? "linear-gradient(to right, #4B9EFF, #1F2D44)"
                          : "#1F2D44",
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Current subtask box — .current-subtask-box */}
      <div
        style={{
          background: "#161E2E",
          border: "1px solid #253352",
          borderRadius: 7,
          padding: "12px 14px",
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: ".08em",
            color: "#455270",
            textTransform: "uppercase",
            marginBottom: 6,
          }}
        >
          Currently working on
        </div>
        {/* .csb-content */}
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          {/* .csb-spinner */}
          <div
            style={{
              width: 11,
              height: 11,
              border: "1.5px solid #253352",
              borderTopColor: "#4B9EFF",
              borderRadius: "50%",
              animation: "agent-spin .9s linear infinite",
              flexShrink: 0,
            }}
          />
          <span style={{ fontSize: 13, color: "#E8EDF5" }}>
            {active?.title ?? "Preparing next subtask…"}
          </span>
        </div>
      </div>

      {/* Steering box — .steering-box */}
      <div
        style={{
          background: "#161E2E",
          border: "1px solid #253352",
          borderRadius: 7,
          padding: "12px 14px",
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: ".08em",
            color: "#455270",
            textTransform: "uppercase",
            marginBottom: 8,
          }}
        >
          Steer the agent
        </div>
        {/* .steering-row */}
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          {/* .steering-input */}
          <textarea
            value={steering}
            onChange={(e) => setSteering(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSteer();
            }}
            placeholder="Send a message to the running agent…"
            rows={1}
            style={{
              flex: 1,
              background: "#141D2F",
              border: "1px solid #253352",
              borderRadius: 5,
              padding: "8px 11px",
              color: "#E8EDF5",
              fontSize: 13,
              fontFamily: "IBM Plex Sans, sans-serif",
              resize: "none",
              outline: "none",
              lineHeight: 1.4,
              transition: "border-color .15s",
            }}
            onFocus={(e) => {
              (e.target as HTMLTextAreaElement).style.borderColor = "#4B9EFF";
            }}
            onBlur={(e) => {
              (e.target as HTMLTextAreaElement).style.borderColor = "#253352";
            }}
          />
          {/* .send-btn */}
          <button
            onClick={handleSteer}
            disabled={!steering.trim() || sending}
            style={{
              padding: "8px 14px",
              background: "#4B9EFF",
              border: "none",
              borderRadius: 5,
              color: "#fff",
              fontSize: 12,
              fontWeight: 600,
              cursor: steering.trim() && !sending ? "pointer" : "not-allowed",
              whiteSpace: "nowrap",
              fontFamily: "IBM Plex Sans, sans-serif",
              transition: "opacity .15s",
              letterSpacing: ".01em",
              opacity: steering.trim() && !sending ? 1 : 0.5,
            }}
          >
            {sending ? "…" : "Send →"}
          </button>
        </div>
        {steerError && (
          <div
            style={{
              marginTop: 6,
              fontSize: 11,
              color: "#F87171",
              fontFamily: "IBM Plex Sans, sans-serif",
            }}
          >
            {steerError}
          </div>
        )}
      </div>

      {/* Control buttons — .control-btns */}
      <div style={{ display: "flex", gap: 8 }}>
        {/* .ctrl-btn.takeover */}
        <button
          onClick={() => agentApi.stop(projectSlug, task.id)}
          style={{
            padding: "8px 14px",
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 500,
            cursor: "pointer",
            fontFamily: "IBM Plex Sans, sans-serif",
            transition: "all .15s",
            border: "1px solid rgba(167,139,250,.4)",
            background: "rgba(167,139,250,.15)",
            color: "#A78BFA",
            letterSpacing: ".01em",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "rgba(167,139,250,.2)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "rgba(167,139,250,.15)";
          }}
        >
          ↩ Take Over
        </button>
        {/* .ctrl-btn.pause / .ctrl-btn.resume */}
        {isPaused ? (
          <button
            onClick={handleResume}
            style={{
              padding: "8px 14px",
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
              fontFamily: "IBM Plex Sans, sans-serif",
              transition: "all .15s",
              border: "1px solid rgba(52,211,153,.3)",
              background: "rgba(52,211,153,.1)",
              color: "#34D399",
              letterSpacing: ".01em",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(52,211,153,.18)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(52,211,153,.1)";
            }}
          >
            ▶ Resume
          </button>
        ) : (
          <button
            onClick={handlePause}
            style={{
              padding: "8px 14px",
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
              fontFamily: "IBM Plex Sans, sans-serif",
              transition: "all .15s",
              border: "1px solid rgba(251,191,36,.2)",
              background: "rgba(251,191,36,.08)",
              color: "#FBBF24",
              letterSpacing: ".01em",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(251,191,36,.15)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(251,191,36,.08)";
            }}
          >
            ⏸ Pause
          </button>
        )}
        {/* .ctrl-btn.stop */}
        <button
          onClick={() => agentApi.stop(projectSlug, task.id)}
          style={{
            padding: "8px 14px",
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 500,
            cursor: "pointer",
            fontFamily: "IBM Plex Sans, sans-serif",
            transition: "all .15s",
            border: "1px solid rgba(248,113,113,.25)",
            background: "rgba(248,113,113,.1)",
            color: "#F87171",
            letterSpacing: ".01em",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "rgba(248,113,113,.18)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "rgba(248,113,113,.1)";
          }}
        >
          ✕ Stop
        </button>
      </div>
    </div>
  );
}
