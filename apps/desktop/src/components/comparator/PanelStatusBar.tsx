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

      {panel.model && <span className="badge badge-accent">{panel.model}</span>}

      <span style={{ marginLeft: "auto" }}>{seconds}s</span>

      {panel.status === "complete" && panel.exitCode !== null && (
        <span className={`badge ${panel.exitCode === 0 ? "badge-success" : "badge-danger"}`}>
          exit {panel.exitCode}
        </span>
      )}

      {panel.status === "killed" && <span className="badge badge-warning">killed</span>}

      {panel.status === "running" && <span className="badge badge-accent">running</span>}
    </div>
  );
}
