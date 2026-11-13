import type { CSSProperties } from "react";
import type { EnvDeclaration } from "@harness-kit/core";
import SectionCard from "./SectionCard";
import { AddForm, EntryRow, SwitchField, TextField } from "./fields";
import type { OnPatch } from "./fields";

interface EnvSectionProps {
  env: EnvDeclaration[];
  onPatch?: OnPatch;
}

const requiredBadgeStyle: CSSProperties = {
  fontSize: "10px",
  padding: "1px 6px",
  borderRadius: "10px",
  background: "var(--danger-light)",
  color: "var(--danger-text)",
};

const sensitiveBadgeStyle: CSSProperties = {
  fontSize: "10px",
  padding: "1px 6px",
  borderRadius: "10px",
  background: "var(--bg-elevated)",
  color: "var(--fg-muted)",
};

export default function EnvSection({ env, onPatch }: EnvSectionProps) {
  if (onPatch) {
    return (
      <SectionCard label="Environment" explanation="Variables that plugins and MCP servers depend on." count={env.length}>
        <div className="row-list">
          {env.map((decl, i) => {
            // The schema's default for `sensitive` is true, and `default` is only
            // allowed beside an explicit `sensitive: false`.
            const sensitive = decl.sensitive !== false;
            const required = (next: boolean) => onPatch({ op: "set", path: ["env", i, "required"], value: next ? true : undefined });
            const setSensitive = (next: boolean) => {
              if (next) {
                onPatch({ op: "set", path: ["env", i, "sensitive"], value: undefined });
                onPatch({ op: "set", path: ["env", i, "default"], value: undefined });
              } else {
                onPatch({ op: "set", path: ["env", i, "sensitive"], value: false });
              }
            };
            return (
              <EntryRow key={i} removeLabel={`Remove variable ${decl.name}`} onRemove={() => onPatch({ op: "remove", path: ["env", i] })}>
                <TextField label="Name" ariaLabel={`Variable ${i + 1} name`} value={decl.name ?? ""} mono onCommit={(next) => onPatch({ op: "set", path: ["env", i, "name"], value: next.trim() })} />
                <TextField label="Description" ariaLabel={`Variable ${i + 1} description`} value={decl.description ?? ""} onCommit={(next) => onPatch({ op: "set", path: ["env", i, "description"], value: next.trim() })} />
                {!sensitive && (
                  <TextField label="Default" ariaLabel={`Variable ${i + 1} default`} value={decl.default ?? ""} onCommit={(next) => onPatch({ op: "set", path: ["env", i, "default"], value: next })} />
                )}
                <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
                  <SwitchField label={`Required: ${decl.name}`} checked={Boolean(decl.required)} onChange={required} />
                  <SwitchField label={`Sensitive: ${decl.name}`} checked={sensitive} onChange={setSensitive} />
                </div>
              </EntryRow>
            );
          })}
        </div>
        <AddForm
          title="Add variable"
          fields={[
            { key: "name", label: "New variable name", required: true, placeholder: "API_TOKEN" },
            { key: "description", label: "New variable description", required: true },
          ]}
          onAdd={({ name, description }) => onPatch({ op: "append", path: ["env"], value: { name, description } })}
        />
      </SectionCard>
    );
  }

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
                {decl.sensitive !== false && (
                  <span style={sensitiveBadgeStyle}>sensitive</span>
                )}
              </div>
              {decl.description && (
                <p style={{
                  fontSize: "11px",
                  color: "var(--fg-muted)",
                  margin: "2px 0 0",
                }}>
                  {decl.description}
                </p>
              )}
              {decl.default !== undefined && decl.sensitive === false && (
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
