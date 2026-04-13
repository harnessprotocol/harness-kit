import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import type { Epic, TaskPriority, TaskStatus } from "../../lib/board-api";
import { api } from "../../lib/board-api";
import { COLUMN_META, COLUMNS } from "../../lib/board-columns";

const PRIORITIES: TaskPriority[] = ["low", "medium", "high", "critical"];

const PRIORITY_CONFIG: Record<
  TaskPriority,
  { label: string; color: string; bgColor: string; borderColor: string }
> = {
  critical: {
    label: "Critical",
    color: "#dc2626",
    bgColor: "rgba(239,68,68,0.1)",
    borderColor: "rgba(239,68,68,0.2)",
  },
  high: {
    label: "High",
    color: "#ea580c",
    bgColor: "rgba(249,115,22,0.1)",
    borderColor: "rgba(249,115,22,0.2)",
  },
  medium: {
    label: "Medium",
    color: "#ca8a04",
    bgColor: "rgba(234,179,8,0.1)",
    borderColor: "rgba(234,179,8,0.2)",
  },
  low: {
    label: "Low",
    color: "var(--text-muted)",
    bgColor: "rgba(107,114,128,0.1)",
    borderColor: "rgba(107,114,128,0.2)",
  },
};

interface Props {
  open: boolean;
  projectSlug: string;
  epics: Epic[];
  defaultEpicId?: number;
  defaultStatus?: TaskStatus;
  onClose: () => void;
  onCreated: () => void;
}

export function TaskForm({
  open,
  projectSlug,
  epics,
  defaultEpicId,
  defaultStatus,
  onClose,
  onCreated,
}: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [epicId, setEpicId] = useState<number>(defaultEpicId ?? epics[0]?.id ?? 0);
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [status, setStatus] = useState<TaskStatus>(defaultStatus ?? "planning");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTitle("");
      setDescription("");
      setEpicId(defaultEpicId ?? epics[0]?.id ?? 0);
      setPriority("medium");
      setStatus(defaultStatus ?? "planning");
      setError("");
      setTimeout(() => titleRef.current?.focus(), 50);
    }
  }, [open, defaultEpicId, defaultStatus, epics]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      setError("Title is required");
      return;
    }
    if (!epicId) {
      setError("Select an epic");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const task = await api.tasks.create(projectSlug, epicId, {
        title: trimmed,
        description: description.trim() || undefined,
        priority,
      });
      // If a specific status was requested, move it from default planning
      if (status !== "planning") {
        await api.tasks.update(projectSlug, task.id, { status });
      }
      onCreated();
      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    background: "var(--bg-base)",
    border: "1px solid var(--border)",
    borderRadius: 6,
    color: "var(--text-primary)",
    fontSize: 14,
    padding: "8px 12px",
    fontFamily: "inherit",
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
  };

  const pillBase: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    borderRadius: 9999,
    border: "1px solid var(--border-subtle)",
    padding: "4px 10px",
    fontSize: 11,
    fontWeight: 500,
    cursor: "pointer",
    background: "var(--bg-elevated)",
    color: "var(--text-muted)",
    transition: "all 0.15s",
  };

  const pillActive: React.CSSProperties = {
    ...pillBase,
    borderColor: "var(--accent)",
    background: "rgba(var(--accent-rgb, 99,102,241), 0.1)",
    color: "var(--text-primary)",
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="board-scope">
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 60 }}
          />
          <motion.div
            key="modal"
            initial={{ opacity: 0, scale: 0.95, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -8 }}
            transition={{ type: "spring", stiffness: 420, damping: 36 }}
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: 480,
              background: "var(--bg-surface)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: 24,
              zIndex: 70,
              display: "flex",
              flexDirection: "column",
              gap: 16,
            }}
          >
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "var(--text-primary)" }}>
              New task
            </h2>

            <form
              onSubmit={handleSubmit}
              style={{ display: "flex", flexDirection: "column", gap: 14 }}
            >
              {/* Epic selector */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 500, color: "var(--text-muted)" }}>
                  Epic
                </label>
                <select
                  value={epicId}
                  onChange={(e) => setEpicId(Number(e.target.value))}
                  style={{ ...inputStyle, appearance: "none" }}
                >
                  {epics.map((ep) => (
                    <option key={ep.id} value={ep.id}>
                      {ep.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Title */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 500, color: "var(--text-muted)" }}>
                  Title
                </label>
                <input
                  ref={titleRef}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="What needs to be done?"
                  style={inputStyle}
                  onFocus={(e) => {
                    (e.target as HTMLElement).style.borderColor = "var(--accent)";
                  }}
                  onBlur={(e) => {
                    (e.target as HTMLElement).style.borderColor = "var(--border)";
                  }}
                />
              </div>

              {/* Description */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 500, color: "var(--text-muted)" }}>
                  Description <span style={{ fontWeight: 400 }}>(optional)</span>
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Add context, acceptance criteria, links..."
                  rows={4}
                  style={{ ...inputStyle, resize: "vertical" }}
                  onFocus={(e) => {
                    (e.target as HTMLElement).style.borderColor = "var(--accent)";
                  }}
                  onBlur={(e) => {
                    (e.target as HTMLElement).style.borderColor = "var(--border)";
                  }}
                />
              </div>

              {/* Status selector */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 500, color: "var(--text-muted)" }}>
                  Status
                </label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {COLUMNS.map((s) => {
                    const meta = COLUMN_META[s];
                    const isActive = status === s;
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setStatus(s)}
                        style={isActive ? pillActive : pillBase}
                      >
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            background: meta.color,
                            display: "inline-block",
                          }}
                        />
                        {meta.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Priority selector */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 500, color: "var(--text-muted)" }}>
                  Priority
                </label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {PRIORITIES.map((p) => {
                    const cfg = PRIORITY_CONFIG[p];
                    const isActive = priority === p;
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPriority(p)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          borderRadius: 9999,
                          padding: "4px 10px",
                          fontSize: 11,
                          fontWeight: 600,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          cursor: "pointer",
                          transition: "all 0.15s",
                          border: isActive
                            ? `1px solid ${cfg.borderColor}`
                            : "1px solid var(--border-subtle)",
                          background: isActive ? cfg.bgColor : "var(--bg-elevated)",
                          color: isActive ? cfg.color : "var(--text-muted)",
                        }}
                      >
                        {cfg.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {error && (
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--blocked)",
                    background: "rgba(220,38,38,0.08)",
                    borderRadius: 6,
                    padding: "6px 10px",
                  }}
                >
                  {error}
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 4 }}>
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    padding: "7px 16px",
                    background: "transparent",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    color: "var(--text-secondary)",
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    padding: "7px 20px",
                    background: "var(--accent)",
                    border: "none",
                    borderRadius: 6,
                    color: "#fff",
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: submitting ? "not-allowed" : "pointer",
                    opacity: submitting ? 0.6 : 1,
                  }}
                >
                  {submitting ? "Creating..." : "Create task"}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
