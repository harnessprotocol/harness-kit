import type { CSSProperties } from "react";
import type { McpServer } from "@harness-kit/core";
import SectionCard from "./SectionCard";

interface McpServersSectionProps {
  servers: Record<string, McpServer>;
}

const transportBadgeStyle: CSSProperties = {
  fontSize: "10px",
  padding: "1px 6px",
  borderRadius: "10px",
  background: "var(--accent-light)",
  color: "var(--accent-text)",
  flexShrink: 0,
};

export default function McpServersSection({ servers }: McpServersSectionProps) {
  const entries = Object.entries(servers);

  return (
    <SectionCard
      label="MCP Servers"
      explanation="External tool servers connected via Model Context Protocol."
      count={entries.length}
    >
      <div className="row-list">
        {entries.map(([name, server]) => (
          <div key={name} className="row-list-item">
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <code style={{
                  fontFamily: "ui-monospace, monospace",
                  fontSize: "12px",
                  color: "var(--fg-base)",
                }}>
                  {name}
                </code>
                <span style={transportBadgeStyle}>{server.transport}</span>
              </div>
              <p style={{
                fontSize: "11px",
                color: "var(--fg-muted)",
                margin: "2px 0 0",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}>
                {server.transport === "stdio"
                  ? server.command
                  : server.url}
              </p>
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
