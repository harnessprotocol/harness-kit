import type { CSSProperties } from "react";
import type { HarnessMetadata } from "@harness-kit/core";
import SectionCard from "./SectionCard";
import { TextField } from "./fields";
import type { OnPatch } from "./fields";

interface MetadataSectionProps {
  metadata: HarnessMetadata;
  onPatch?: OnPatch;
}

const pillStyle: CSSProperties = {
  fontSize: "10px",
  padding: "1px 7px",
  borderRadius: "10px",
  background: "var(--bg-elevated)",
  color: "var(--fg-subtle)",
  lineHeight: "16px",
};

export default function MetadataSection({ metadata, onPatch }: MetadataSectionProps) {
  const set = (key: string) => onPatch && ((next: string) => onPatch({ op: "set", path: ["metadata", key], value: next.trim() }));

  if (onPatch) {
    return (
      <SectionCard label="Metadata" explanation="Identity and ownership of this harness profile.">
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <TextField label="Name" value={metadata.name ?? ""} mono onCommit={set("name")} />
          <TextField label="Description" value={metadata.description ?? ""} onCommit={set("description")} />
          <TextField label="Version" value={metadata.version ?? ""} onCommit={set("version")} />
          <TextField label="License" value={metadata.license ?? ""} onCommit={set("license")} />
          <TextField
            label="Author"
            value={metadata.author?.name ?? ""}
            onCommit={(next) => onPatch({ op: "set", path: ["metadata", "author", "name"], value: next.trim() })}
          />
          <TextField
            label="Tags (comma separated)"
            value={(metadata.tags ?? []).join(", ")}
            onCommit={(next) => {
              const tags = next.split(",").map((t) => t.trim()).filter(Boolean);
              onPatch({ op: "set", path: ["metadata", "tags"], value: tags.length ? tags : undefined });
            }}
          />
        </div>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      label="Metadata"
      explanation="Identity and ownership of this harness profile."
    >
      <code style={{
        fontFamily: "ui-monospace, monospace",
        fontSize: "15px",
        fontWeight: 500,
        color: "var(--fg-base)",
        display: "block",
      }}>
        {metadata.name}
      </code>

      {metadata.description && (
        <p style={{
          fontSize: "12px",
          fontStyle: "italic",
          color: "var(--fg-muted)",
          margin: "4px 0 0",
        }}>
          {metadata.description}
        </p>
      )}

      {(metadata.version || metadata.license) && (
        <div style={{ display: "flex", gap: "6px", marginTop: "8px", flexWrap: "wrap" }}>
          {metadata.version && (
            <span style={pillStyle}>v{metadata.version}</span>
          )}
          {metadata.license && (
            <span style={pillStyle}>{metadata.license}</span>
          )}
        </div>
      )}

      {metadata.author && (
        <p style={{
          fontSize: "11px",
          color: "var(--fg-subtle)",
          margin: "6px 0 0",
        }}>
          by {metadata.author.name}
        </p>
      )}

      {metadata.tags && metadata.tags.length > 0 && (
        <div style={{ display: "flex", gap: "5px", marginTop: "8px", flexWrap: "wrap" }}>
          {metadata.tags.map((tag) => (
            <span key={tag} style={pillStyle}>{tag}</span>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
