// apps/desktop/src/components/agent/DiffTab.tsx
// Ported from docs/plans/agent-ui-mock.html:
// .diff-bar, .diff-code, .d-hunk, .d-add, .d-rem, .d-ctx, .d-ln, .d-text

import type React from "react";
import type { AgentEvent } from "../../lib/agent-api";

function lineStyle(line: string): React.CSSProperties {
  if (line.startsWith("@@")) {
    return { color: "#4B9EFF", background: "rgba(75,158,255,.07)", display: "flex" };
  }
  if (line.startsWith("+")) {
    return { color: "#34D399", background: "rgba(52,211,153,.06)", display: "flex" };
  }
  if (line.startsWith("-")) {
    return { color: "#F87171", background: "rgba(248,113,113,.07)", display: "flex" };
  }
  return { color: "#6B7FA0", display: "flex" };
}

export function DiffTab({ events }: { events: AgentEvent[] }) {
  const edits = events.filter(
    (e) =>
      e.type === "agent_tool" &&
      (e.action === "editing" || e.action === "writing") &&
      e.state === "done",
  );

  if (edits.length === 0) {
    return <div style={{ padding: "24px", color: "#455270", fontSize: 13 }}>No edits yet.</div>;
  }

  return (
    // .diff-code
    <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11.5, lineHeight: 1.65 }}>
      {edits.map((e, i) => {
        if (e.type !== "agent_tool") return null;
        return (
          <div key={i}>
            {/* .diff-bar */}
            <div
              style={{
                padding: "10px 24px",
                borderBottom: "1px solid #1F2D44",
                display: "flex",
                alignItems: "center",
                gap: 10,
                background: "rgba(255,255,255,.02)",
                color: "#6B7FA0",
                fontSize: 11,
              }}
            >
              <span style={{ flexShrink: 0, color: "#455270" }}>⊟</span>
              <span>{e.path}</span>
            </div>
            {(e.output ?? []).map((line, j) => (
              <div key={j} style={lineStyle(line)}>
                {/* .d-ln */}
                <span
                  style={{
                    minWidth: 40,
                    padding: "0 10px",
                    textAlign: "right",
                    userSelect: "none",
                    flexShrink: 0,
                    borderRight: "1px solid #1F2D44",
                    color: "#455270",
                    opacity: 0.6,
                  }}
                >
                  {j + 1}
                </span>
                {/* .d-text */}
                <span style={{ padding: "0 16px", flex: 1 }}>{line}</span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
