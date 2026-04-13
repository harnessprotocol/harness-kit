import type { HarnessMetadata } from "@harness-kit/core";
import type { CSSProperties } from "react";
import SectionCard from "./SectionCard";

interface MetadataSectionProps {
  metadata: HarnessMetadata;
}

const pillStyle: CSSProperties = {
  fontSize: "10px",
  padding: "1px 7px",
  borderRadius: "10px",
  background: "var(--bg-elevated)",
  color: "var(--fg-subtle)",
  lineHeight: "16px",
};

export default function MetadataSection({ metadata }: MetadataSectionProps) {
  return (
    <SectionCard label="Metadata" explanation="Identity and ownership of this harness profile.">
      <code
        style={{
          fontFamily: "ui-monospace, monospace",
          fontSize: "15px",
          fontWeight: 500,
          color: "var(--fg-base)",
          display: "block",
        }}
      >
        {metadata.name}
      </code>

      {metadata.description && (
        <p
          style={{
            fontSize: "12px",
            fontStyle: "italic",
            color: "var(--fg-muted)",
            margin: "4px 0 0",
          }}
        >
          {metadata.description}
        </p>
      )}

      {(metadata.version || metadata.license) && (
        <div style={{ display: "flex", gap: "6px", marginTop: "8px", flexWrap: "wrap" }}>
          {metadata.version && <span style={pillStyle}>v{metadata.version}</span>}
          {metadata.license && <span style={pillStyle}>{metadata.license}</span>}
        </div>
      )}

      {metadata.author && (
        <p
          style={{
            fontSize: "11px",
            color: "var(--fg-subtle)",
            margin: "6px 0 0",
          }}
        >
          by {metadata.author.name}
        </p>
      )}

      {metadata.tags && metadata.tags.length > 0 && (
        <div style={{ display: "flex", gap: "5px", marginTop: "8px", flexWrap: "wrap" }}>
          {metadata.tags.map((tag) => (
            <span key={tag} style={pillStyle}>
              {tag}
            </span>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
