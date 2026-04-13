import type { HarnessPlugin } from "@harness-kit/core";
import type { CSSProperties } from "react";
import SectionCard from "./SectionCard";

interface PluginsSectionProps {
  plugins: HarnessPlugin[];
}

const versionBadgeStyle: CSSProperties = {
  fontSize: "10px",
  padding: "1px 6px",
  borderRadius: "10px",
  background: "var(--bg-elevated)",
  color: "var(--fg-subtle)",
  flexShrink: 0,
};

export default function PluginsSection({ plugins }: PluginsSectionProps) {
  return (
    <SectionCard
      label="Plugins"
      explanation="Skills and agents installed from plugin sources."
      count={plugins.length}
    >
      <div className="row-list">
        {plugins.map((plugin, i) => (
          <div key={`${plugin.name}-${i}`} className="row-list-item">
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <code
                  style={{
                    fontFamily: "ui-monospace, monospace",
                    fontSize: "12px",
                    color: "var(--fg-base)",
                  }}
                >
                  {plugin.name}
                </code>
                <span
                  style={{
                    fontSize: "11px",
                    color: "var(--fg-muted)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    flex: 1,
                  }}
                >
                  {plugin.source}
                </span>
              </div>
              {plugin.description && (
                <p
                  style={{
                    fontSize: "11px",
                    fontStyle: "italic",
                    color: "var(--fg-muted)",
                    margin: "2px 0 0",
                  }}
                >
                  {plugin.description}
                </p>
              )}
            </div>
            {plugin.version && <span style={versionBadgeStyle}>{plugin.version}</span>}
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
