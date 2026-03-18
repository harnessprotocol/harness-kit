import type { CSSProperties } from "react";
import type { EnvDeclaration } from "@harness-kit/core";
import SectionCard from "./SectionCard";

interface EnvSectionProps {
  env: EnvDeclaration[];
}

const requiredBadgeStyle: CSSProperties = {
  fontSize: "10px",
  padding: "1px 6px",
  borderRadius: "10px",
  background: "rgba(220,53,69,0.1)",
  color: "var(--danger)",
};

const sensitiveBadgeStyle: CSSProperties = {
  fontSize: "10px",
  padding: "1px 6px",
  borderRadius: "10px",
  background: "var(--bg-elevated)",
  color: "var(--fg-muted)",
};

export default function EnvSection({ env }: EnvSectionProps) {
  return (
    <SectionCard
      label="Environment"
      explanation="Variables that plugins and MCP servers depend on."
      count={env.length}
    >
      <div className="row-list">
        {env.map((decl) => (
          <div key={decl.name} className="row-list-item">
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                <code style={{
                  fontFamily: "ui-monospace, monospace",
                  fontSize: "12px",
                  color: "var(--fg-base)",
                }}>
                  {decl.name}
                </code>
                {decl.required && (
                  <span style={requiredBadgeStyle}>required</span>
                )}
                {decl.sensitive && (
                  <span style={sensitiveBadgeStyle}>sensitive</span>
                )}
              </div>
              <p style={{
                fontSize: "11px",
                color: "var(--fg-muted)",
                margin: "2px 0 0",
              }}>
                {decl.description}
              </p>
              {decl.default !== undefined && (
                <p style={{
                  fontSize: "11px",
                  fontStyle: "italic",
                  color: "var(--fg-subtle)",
                  margin: "2px 0 0",
                }}>
                  default: {decl.default}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
