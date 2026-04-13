// apps/desktop/src/components/agent/FilesTab.tsx
// Ported from docs/plans/agent-ui-mock.html:
// .files-body, .file-row, .file-icon-col, .file-path, .file-path .dir, .file-path .name

import type { AgentEvent } from "../../lib/agent-api";

export function FilesTab({ events }: { events: AgentEvent[] }) {
  // Derive modified files from write/edit tool events
  const fileMap = new Map<string, { writes: number }>();
  for (const e of events) {
    if (
      e.type === "agent_tool" &&
      (e.action === "editing" || e.action === "writing") &&
      e.state === "done"
    ) {
      if (!fileMap.has(e.path)) fileMap.set(e.path, { writes: 0 });
      fileMap.get(e.path)!.writes += 1;
    }
  }

  if (fileMap.size === 0) {
    return (
      <div style={{ padding: "24px", color: "#455270", fontSize: 13 }}>No files modified yet.</div>
    );
  }

  return (
    // .files-body
    <div style={{ padding: "4px 0" }}>
      {[...fileMap.entries()].map(([path]) => {
        const parts = path.split("/");
        const name = parts.pop()!;
        const dir = parts.length > 0 ? parts.join("/") + "/" : "";
        return (
          // .file-row
          <div
            key={path}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 24px",
              borderBottom: "1px solid #1F2D44",
              cursor: "pointer",
              transition: "background .1s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,.02)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "transparent";
            }}
          >
            {/* .file-icon-col */}
            <span style={{ color: "#455270", fontSize: 12, flexShrink: 0 }}>⊟</span>
            {/* .file-path */}
            <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, flex: 1 }}>
              <span style={{ color: "#6B7FA0" }}>{dir}</span>
              <span style={{ color: "#E8EDF5" }}>{name}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
