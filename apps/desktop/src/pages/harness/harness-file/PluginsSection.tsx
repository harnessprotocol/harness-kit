import type { CSSProperties } from "react";
import type { HarnessPlugin } from "@harness-kit/core";
import SectionCard from "./SectionCard";
import { AddForm, EntryRow, TextField } from "./fields";
import type { OnPatch } from "./fields";

interface PluginsSectionProps {
  plugins: HarnessPlugin[];
  onPatch?: OnPatch;
}

const versionBadgeStyle: CSSProperties = {
  fontSize: "10px",
  padding: "1px 6px",
  borderRadius: "10px",
  background: "var(--bg-elevated)",
  color: "var(--fg-subtle)",
  flexShrink: 0,
};

export default function PluginsSection({ plugins, onPatch }: PluginsSectionProps) {
  if (onPatch) {
    return (
      <SectionCard label="Plugins" explanation="Skills and agents installed from plugin sources." count={plugins.length}>
        <div className="row-list">
          {plugins.map((plugin, i) => {
            const set = (key: string) => (next: string) =>
              onPatch({ op: "set", path: ["plugins", i, key], value: next.trim() });
            return (
              <EntryRow key={i} removeLabel={`Remove plugin ${plugin.name}`} onRemove={() => onPatch({ op: "remove", path: ["plugins", i] })}>
                <TextField label="Name" ariaLabel={`Plugin ${i + 1} name`} value={plugin.name ?? ""} mono onCommit={set("name")} />
                <TextField label="Source" ariaLabel={`Plugin ${i + 1} source`} value={plugin.source ?? ""} onCommit={set("source")} />
                <TextField label="Version" ariaLabel={`Plugin ${i + 1} version`} value={plugin.version ?? ""} onCommit={set("version")} />
                <TextField label="Description" ariaLabel={`Plugin ${i + 1} description`} value={plugin.description ?? ""} onCommit={set("description")} />
              </EntryRow>
            );
          })}
        </div>
        <AddForm
          title="Add plugin"
          fields={[
            { key: "name", label: "New plugin name", required: true, placeholder: "my-plugin" },
            { key: "source", label: "New plugin source", required: true, placeholder: "owner/repo" },
          ]}
          onAdd={({ name, source }) => onPatch({ op: "append", path: ["plugins"], value: { name, source } })}
        />
      </SectionCard>
    );
  }

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
                <code style={{
                  fontFamily: "ui-monospace, monospace",
                  fontSize: "12px",
                  color: "var(--fg-base)",
                }}>
                  {plugin.name}
                </code>
                <span style={{
                  fontSize: "11px",
                  color: "var(--fg-muted)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  flex: 1,
                }}>
                  {plugin.source}
                </span>
              </div>
              {plugin.description && (
                <p style={{
                  fontSize: "11px",
                  fontStyle: "italic",
                  color: "var(--fg-muted)",
                  margin: "2px 0 0",
                }}>
                  {plugin.description}
                </p>
              )}
            </div>
            {plugin.version && (
              <span style={versionBadgeStyle}>{plugin.version}</span>
            )}
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
