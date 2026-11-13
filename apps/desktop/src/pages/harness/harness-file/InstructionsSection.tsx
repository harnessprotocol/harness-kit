import type { CSSProperties } from "react";
import type { HarnessInstructions } from "@harness-kit/core";
import { Select } from "@harness-kit/ui";
import SectionCard from "./SectionCard";
import { TextField } from "./fields";
import type { OnPatch } from "./fields";

interface InstructionsSectionProps {
  instructions: HarnessInstructions;
  onPatch?: OnPatch;
}

const subLabelStyle: CSSProperties = {
  fontSize: "10px",
  fontWeight: 600,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--fg-subtle)",
  marginBottom: "4px",
};

const preStyle: CSSProperties = {
  margin: "4px 0 12px",
  fontFamily: "ui-monospace, monospace",
  fontSize: "11px",
  lineHeight: "1.6",
  color: "var(--fg-muted)",
  whiteSpace: "pre-wrap",
  background: "var(--bg-elevated)",
  padding: "8px 10px",
  borderRadius: "6px",
};

const importModeBadgeStyle: CSSProperties = {
  fontSize: "10px",
  padding: "1px 6px",
  borderRadius: "10px",
  background: "var(--bg-elevated)",
  color: "var(--fg-subtle)",
  display: "inline-block",
  marginBottom: "10px",
};

const slots: Array<{ key: "operational" | "behavioral" | "identity"; label: string }> = [
  { key: "operational", label: "Operational" },
  { key: "behavioral", label: "Behavioral" },
  { key: "identity", label: "Identity" },
];

export default function InstructionsSection({ instructions, onPatch }: InstructionsSectionProps) {
  if (onPatch) {
    return (
      <SectionCard
        label="Instructions"
        explanation="Text injected into CLAUDE.md, AGENT.md, or equivalent at harness import time."
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {slots.map(({ key, label }) => (
            <TextField
              key={key}
              label={label}
              multiline
              value={instructions[key] ?? ""}
              onCommit={(next) => onPatch({ op: "set", path: ["instructions", key], value: next })}
            />
          ))}
          <Select
            label="Import mode"
            value={instructions["import-mode"] ?? ""}
            onChange={(e) => onPatch({ op: "set", path: ["instructions", "import-mode"], value: e.target.value })}
            options={[
              { value: "", label: "Default" },
              { value: "merge", label: "merge" },
              { value: "replace", label: "replace" },
              { value: "skip", label: "skip" },
            ]}
          />
        </div>
      </SectionCard>
    );
  }

  const hasContent = slots.some(({ key }) => instructions[key] != null);

  return (
    <SectionCard
      label="Instructions"
      explanation="Text injected into CLAUDE.md, AGENT.md, or equivalent at harness import time."
    >
      {instructions["import-mode"] && (
        <span style={importModeBadgeStyle}>
          import-mode: {instructions["import-mode"]}
        </span>
      )}

      {hasContent ? (
        slots.map(({ key, label }) => {
          const content = instructions[key];
          if (content == null) return null;
          return (
            <div key={key}>
              <div style={subLabelStyle}>{label}</div>
              <pre style={preStyle}>{content}</pre>
            </div>
          );
        })
      ) : (
        <p style={{ fontSize: "12px", color: "var(--fg-subtle)", margin: 0 }}>
          No instruction content.
        </p>
      )}
    </SectionCard>
  );
}
