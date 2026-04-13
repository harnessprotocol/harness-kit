import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ROADMAP_COMPLEXITY_CONFIG,
  ROADMAP_IMPACT_CONFIG,
  ROADMAP_PRIORITY_CONFIG,
} from "../../lib/roadmap-constants";
import type { RoadmapFeature, RoadmapFeaturePriority, RoadmapPhase } from "../../lib/roadmap-types";

interface Props {
  phases: RoadmapPhase[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (feature: Omit<RoadmapFeature, "id">) => void;
}

const inputStyle: React.CSSProperties = {
  background: "var(--bg-base)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  color: "var(--fg-base)",
  fontSize: 13,
  padding: "8px 10px",
  fontFamily: "inherit",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "var(--fg-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
};

const pillBase: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  borderRadius: 9999,
  border: "1px solid var(--border-subtle)",
  padding: "4px 10px",
  fontSize: 11,
  fontWeight: 500,
  cursor: "pointer",
  background: "var(--bg-elevated)",
  color: "var(--fg-muted)",
  transition: "all 0.12s",
};

const PRIORITIES: RoadmapFeaturePriority[] = ["must", "should", "could", "wont"];
const LEVELS = ["low", "medium", "high"] as const;

export function AddFeatureDialog({ phases, open, onOpenChange, onAdd }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [rationale, setRationale] = useState("");
  const [priority, setPriority] = useState<RoadmapFeaturePriority>("should");
  const [complexity, setComplexity] = useState<"low" | "medium" | "high">("medium");
  const [impact, setImpact] = useState<"low" | "medium" | "high">("medium");
  const [phaseId, setPhaseId] = useState("");
  const [error, setError] = useState("");
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTitle("");
      setDescription("");
      setRationale("");
      setPriority("should");
      setComplexity("medium");
      setImpact("medium");
      setPhaseId(phases.length > 0 ? phases[0].id : "");
      setError("");
      setTimeout(() => titleRef.current?.focus(), 50);
    }
  }, [open, phases]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onOpenChange(false);
    }
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    if (!phaseId) {
      setError("Phase is required");
      return;
    }
    onAdd({
      title: title.trim(),
      description: description.trim(),
      rationale: rationale.trim(),
      priority,
      complexity,
      impact,
      phaseId,
      status: "backlog",
      dependencies: [],
      acceptanceCriteria: [],
      userStories: [],
      competitorInsightIds: [],
    });
    onOpenChange(false);
  }

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="board-scope">
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => onOpenChange(false)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 50 }}
          />
          <motion.div
            key="dialog"
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: "spring", stiffness: 420, damping: 36 }}
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: 520,
              maxWidth: "calc(100vw - 32px)",
              maxHeight: "90vh",
              background: "var(--bg-surface)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              boxShadow: "var(--shadow-popover)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              zIndex: 51,
            }}
          >
            <div
              style={{
                padding: "18px 20px",
                borderBottom: "1px solid var(--border-subtle)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexShrink: 0,
              }}
            >
              <span style={{ fontSize: 15, fontWeight: 600, color: "var(--fg-base)" }}>
                Add Feature
              </span>
              <button
                onClick={() => onOpenChange(false)}
                aria-label="Close"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  border: "1px solid var(--border-subtle)",
                  background: "transparent",
                  color: "var(--fg-muted)",
                  cursor: "pointer",
                  fontSize: 16,
                }}
              >
                ×
              </button>
            </div>

            <form
              onSubmit={handleSubmit}
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "16px 20px",
                display: "flex",
                flexDirection: "column",
                gap: 14,
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={labelStyle}>
                  Title <span style={{ color: "#dc2626" }}>*</span>
                </label>
                <input
                  ref={titleRef}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Feature name"
                  style={inputStyle}
                  onFocus={(e) => {
                    (e.target as HTMLElement).style.borderColor = "var(--accent)";
                  }}
                  onBlur={(e) => {
                    (e.target as HTMLElement).style.borderColor = "var(--border)";
                  }}
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={labelStyle}>Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What should this feature do?"
                  rows={3}
                  style={{ ...inputStyle, resize: "vertical" }}
                  onFocus={(e) => {
                    (e.target as HTMLElement).style.borderColor = "var(--accent)";
                  }}
                  onBlur={(e) => {
                    (e.target as HTMLElement).style.borderColor = "var(--border)";
                  }}
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={labelStyle}>Rationale</label>
                <textarea
                  value={rationale}
                  onChange={(e) => setRationale(e.target.value)}
                  placeholder="Why is this feature needed?"
                  rows={2}
                  style={{ ...inputStyle, resize: "vertical" }}
                  onFocus={(e) => {
                    (e.target as HTMLElement).style.borderColor = "var(--accent)";
                  }}
                  onBlur={(e) => {
                    (e.target as HTMLElement).style.borderColor = "var(--border)";
                  }}
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={labelStyle}>
                  Phase <span style={{ color: "#dc2626" }}>*</span>
                </label>
                <select
                  value={phaseId}
                  onChange={(e) => setPhaseId(e.target.value)}
                  style={{ ...inputStyle, appearance: "none" }}
                >
                  {phases.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.order}. {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={labelStyle}>Priority</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {PRIORITIES.map((p) => {
                    const cfg = ROADMAP_PRIORITY_CONFIG[p];
                    const isActive = priority === p;
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPriority(p)}
                        style={{
                          ...pillBase,
                          border: isActive
                            ? `1px solid ${cfg.border}`
                            : "1px solid var(--border-subtle)",
                          background: isActive ? cfg.bg : "var(--bg-elevated)",
                          color: isActive ? cfg.color : "var(--fg-muted)",
                          fontWeight: isActive ? 600 : 500,
                        }}
                      >
                        {cfg.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={labelStyle}>Complexity</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {LEVELS.map((l) => {
                    const cfg = ROADMAP_COMPLEXITY_CONFIG[l];
                    const isActive = complexity === l;
                    return (
                      <button
                        key={l}
                        type="button"
                        onClick={() => setComplexity(l)}
                        style={{
                          ...pillBase,
                          border: isActive
                            ? `1px solid ${cfg.color}40`
                            : "1px solid var(--border-subtle)",
                          background: isActive ? `${cfg.color}18` : "var(--bg-elevated)",
                          color: isActive ? cfg.color : "var(--fg-muted)",
                          fontWeight: isActive ? 600 : 500,
                        }}
                      >
                        {cfg.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={labelStyle}>Impact</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {LEVELS.map((l) => {
                    const cfg = ROADMAP_IMPACT_CONFIG[l];
                    const isActive = impact === l;
                    return (
                      <button
                        key={l}
                        type="button"
                        onClick={() => setImpact(l)}
                        style={{
                          ...pillBase,
                          border: isActive
                            ? `1px solid ${cfg.color}40`
                            : "1px solid var(--border-subtle)",
                          background: isActive ? `${cfg.color}18` : "var(--bg-elevated)",
                          color: isActive ? cfg.color : "var(--fg-muted)",
                          fontWeight: isActive ? 600 : 500,
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
                    color: "#dc2626",
                    background: "rgba(220,38,38,0.08)",
                    borderRadius: 6,
                    padding: "6px 10px",
                  }}
                >
                  {error}
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 4 }}>
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  style={{
                    padding: "7px 16px",
                    background: "transparent",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    color: "var(--fg-muted)",
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    padding: "7px 20px",
                    background: "var(--accent)",
                    border: "none",
                    borderRadius: 6,
                    color: "#fff",
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  Add Feature
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
