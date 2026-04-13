import type { HarnessPermissions } from "@harness-kit/core";
import type { CSSProperties } from "react";
import SectionCard from "./SectionCard";

interface PermissionsSectionProps {
  permissions: HarnessPermissions;
}

// ── Tool categorization ──────────────────────────────────────

const TOOL_CATEGORIES: Array<{ label: string; pattern: RegExp }> = [
  { label: "File System", pattern: /^(Read|Write|Edit|Glob|Grep|NotebookEdit)$/i },
  { label: "Shell", pattern: /^(Bash|Terminal)$/i },
  { label: "MCP", pattern: /^mcp__/i },
  {
    label: "Agent & Tasks",
    pattern: /^(Agent|Task|TodoRead|TodoWrite|SendMessage|TeamCreate|TeamDelete)$/i,
  },
  { label: "Browser & Web", pattern: /^(WebFetch|WebSearch|Browser)$/i },
  { label: "LSP & Dev", pattern: /^(LSP|EnterPlanMode|ExitPlanMode|EnterWorktree|ExitWorktree)$/i },
];

interface ToolGroup {
  label: string;
  tools: string[];
}

function categorizeTools(tools: string[]): ToolGroup[] {
  const grouped = new Map<string, string[]>();
  const uncategorized: string[] = [];

  for (const tool of tools) {
    let matched = false;
    for (const cat of TOOL_CATEGORIES) {
      if (cat.pattern.test(tool)) {
        const existing = grouped.get(cat.label) ?? [];
        existing.push(tool);
        grouped.set(cat.label, existing);
        matched = true;
        break;
      }
    }
    if (!matched) uncategorized.push(tool);
  }

  const result: ToolGroup[] = [];
  for (const cat of TOOL_CATEGORIES) {
    const items = grouped.get(cat.label);
    if (items && items.length > 0) result.push({ label: cat.label, tools: items });
  }
  if (uncategorized.length > 0) result.push({ label: "Other", tools: uncategorized });
  return result;
}

// ── Styles ───────────────────────────────────────────────────

const sectionLabelStyle: CSSProperties = {
  fontSize: "10px",
  fontWeight: 600,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--fg-subtle)",
  marginBottom: "8px",
};

const firstSectionLabelStyle: CSSProperties = {
  ...sectionLabelStyle,
  marginTop: 0,
};

const laterSectionLabelStyle: CSSProperties = {
  ...sectionLabelStyle,
  marginTop: "14px",
};

const categoryLabelStyle: CSSProperties = {
  fontSize: "10px",
  fontWeight: 500,
  color: "var(--fg-muted)",
  marginBottom: "4px",
  paddingLeft: "2px",
};

const toolItemStyle: CSSProperties = {
  fontSize: "11px",
  fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace",
  padding: "2px 8px",
  borderRadius: "4px",
  display: "inline-block",
  marginRight: "4px",
  marginBottom: "3px",
};

const allowToolStyle: CSSProperties = {
  ...toolItemStyle,
  background: "rgba(40,167,69,0.10)",
  color: "#28a745",
  border: "1px solid rgba(40,167,69,0.2)",
};

const denyToolStyle: CSSProperties = {
  ...toolItemStyle,
  background: "rgba(220,53,69,0.10)",
  color: "var(--danger)",
  border: "1px solid rgba(220,53,69,0.2)",
};

const askToolStyle: CSSProperties = {
  ...toolItemStyle,
  background: "rgba(255,193,7,0.10)",
  color: "#856404",
  border: "1px solid rgba(255,193,7,0.2)",
};

const monoPathStyle: CSSProperties = {
  fontFamily: "ui-monospace, monospace",
  fontSize: "11px",
  color: "var(--fg-muted)",
  display: "block",
  padding: "1px 0",
};

// ── Sub-components ───────────────────────────────────────────

function ToolGroupDisplay({
  groups,
  badgeStyle,
}: {
  groups: ToolGroup[];
  badgeStyle: CSSProperties;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      {groups.map((group) => (
        <div key={group.label}>
          <div style={categoryLabelStyle}>{group.label}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "2px" }}>
            {group.tools.map((t) => (
              <span key={t} style={badgeStyle}>
                {t}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Component ────────────────────────────────────────────────

export default function PermissionsSection({ permissions }: PermissionsSectionProps) {
  const { tools, paths, network } = permissions;
  const hasTools = tools && (tools.allow?.length || tools.deny?.length || tools.ask?.length);
  const hasPaths = paths && (paths.writable?.length || paths.readonly?.length);
  const hasNetwork = network?.["allowed-hosts"]?.length;

  const firstSection = hasTools ? "tools" : hasPaths ? "paths" : "network";
  const labelStyle = (section: string): CSSProperties =>
    section === firstSection ? firstSectionLabelStyle : laterSectionLabelStyle;

  return (
    <SectionCard
      label="Permissions"
      explanation="Tool access controls, writable paths, and network rules."
    >
      {hasTools && (
        <div>
          <div style={labelStyle("tools")}>Tools</div>

          {tools?.allow && tools.allow.length > 0 && (
            <div style={{ marginBottom: "10px" }}>
              <div
                style={{
                  fontSize: "10px",
                  fontWeight: 600,
                  color: "#28a745",
                  marginBottom: "6px",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <span
                  style={{
                    width: "6px",
                    height: "6px",
                    borderRadius: "50%",
                    background: "#28a745",
                    display: "inline-block",
                  }}
                />
                Allow ({tools.allow.length})
              </div>
              <ToolGroupDisplay groups={categorizeTools(tools.allow)} badgeStyle={allowToolStyle} />
            </div>
          )}

          {tools?.deny && tools.deny.length > 0 && (
            <div style={{ marginBottom: "10px" }}>
              <div
                style={{
                  fontSize: "10px",
                  fontWeight: 600,
                  color: "var(--danger)",
                  marginBottom: "6px",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <span
                  style={{
                    width: "6px",
                    height: "6px",
                    borderRadius: "50%",
                    background: "var(--danger)",
                    display: "inline-block",
                  }}
                />
                Deny ({tools.deny.length})
              </div>
              <ToolGroupDisplay groups={categorizeTools(tools.deny)} badgeStyle={denyToolStyle} />
            </div>
          )}

          {tools?.ask && tools.ask.length > 0 && (
            <div style={{ marginBottom: "10px" }}>
              <div
                style={{
                  fontSize: "10px",
                  fontWeight: 600,
                  color: "#856404",
                  marginBottom: "6px",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <span
                  style={{
                    width: "6px",
                    height: "6px",
                    borderRadius: "50%",
                    background: "#d4a017",
                    display: "inline-block",
                  }}
                />
                Ask ({tools.ask.length})
              </div>
              <ToolGroupDisplay groups={categorizeTools(tools.ask)} badgeStyle={askToolStyle} />
            </div>
          )}
        </div>
      )}

      {hasPaths && (
        <div>
          <div style={labelStyle("paths")}>Paths</div>
          {paths?.writable && paths.writable.length > 0 && (
            <div style={{ marginBottom: "6px" }}>
              <div style={{ ...categoryLabelStyle, color: "#28a745" }}>Writable</div>
              {paths.writable.map((p) => (
                <code key={p} style={{ ...monoPathStyle, color: "#28a745" }}>
                  {p}
                </code>
              ))}
            </div>
          )}
          {paths?.readonly && paths.readonly.length > 0 && (
            <div style={{ marginBottom: "6px" }}>
              <div style={categoryLabelStyle}>Read-only</div>
              {paths.readonly.map((p) => (
                <code key={p} style={monoPathStyle}>
                  {p}
                </code>
              ))}
            </div>
          )}
        </div>
      )}

      {hasNetwork && (
        <div>
          <div style={labelStyle("network")}>Network</div>
          <div style={categoryLabelStyle}>Allowed Hosts</div>
          {network?.["allowed-hosts"]?.map((host) => (
            <code key={host} style={monoPathStyle}>
              {host}
            </code>
          ))}
        </div>
      )}

      {!hasTools && !hasPaths && !hasNetwork && (
        <p style={{ fontSize: "12px", color: "var(--fg-subtle)", margin: 0 }}>
          No permissions configured.
        </p>
      )}
    </SectionCard>
  );
}
