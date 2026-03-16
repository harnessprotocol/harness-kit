import { useEffect, useState } from "react";
import type { PanelState } from "../../hooks/useComparison";

interface PanelStatusBarProps {
  panel: PanelState;
}

export default function PanelStatusBar({ panel }: PanelStatusBarProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (panel.status !== "running" || !panel.startedAt) return;

    const tick = () => setElapsed(Date.now() - panel.startedAt!);
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [panel.status, panel.startedAt]);

  const displayMs = panel.status === "complete" || panel.status === "killed" ? panel.durationMs : elapsed;
  const seconds = (displayMs / 1000).toFixed(1);

  return (
    <div
      className="comparator-status-bar"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "6px 12px",
        borderTop: "1px solid var(--separator)",
        fontSize: "11px",
        color: "var(--fg-subtle)",
      }}
    >
      <span style={{ fontWeight: 500, color: "var(--fg-muted)" }}>{panel.harnessName}</span>

      {panel.model && (
        <span
          style={{
            fontSize: "10px",
            padding: "1px 6px",
            borderRadius: "4px",
            background: "var(--accent-light)",
            color: "var(--accent-text)",
          }}
        >
          {panel.model}
        </span>
      )}

      <span style={{ marginLeft: "auto" }}>{seconds}s</span>

      {panel.status === "complete" && panel.exitCode !== null && (
        <span
          style={{
            fontSize: "10px",
            fontWeight: 600,
            padding: "1px 6px",
            borderRadius: "4px",
            background: panel.exitCode === 0 ? "var(--success)" : "var(--danger)",
            color: "#fff",
          }}
        >
          exit {panel.exitCode}
        </span>
      )}

      {panel.status === "killed" && (
        <span
          style={{
            fontSize: "10px",
            fontWeight: 600,
            padding: "1px 6px",
            borderRadius: "4px",
            background: "var(--warning)",
            color: "#fff",
          }}
        >
          killed
        </span>
      )}

      {panel.status === "running" && (
        <span
          style={{
            fontSize: "10px",
            fontWeight: 500,
            padding: "1px 6px",
            borderRadius: "4px",
            background: "var(--accent-light)",
            color: "var(--accent-text)",
          }}
        >
          running
        </span>
      )}
    </div>
  );
}
