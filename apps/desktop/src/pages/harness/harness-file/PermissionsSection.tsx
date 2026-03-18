import type { CSSProperties } from "react";
import type { HarnessPermissions } from "@harness-kit/core";
import SectionCard from "./SectionCard";

interface PermissionsSectionProps {
  permissions: HarnessPermissions;
}

const subLabelStyle: CSSProperties = {
  fontSize: "10px",
  fontWeight: 600,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--fg-subtle)",
  marginBottom: "6px",
  marginTop: "12px",
};

const firstSubLabelStyle: CSSProperties = {
  ...subLabelStyle,
  marginTop: 0,
};

const allowBadgeStyle: CSSProperties = {
  fontSize: "11px",
  padding: "1px 8px",
  borderRadius: "10px",
  background: "rgba(40,167,69,0.12)",
  color: "#28a745",
};

const denyBadgeStyle: CSSProperties = {
  fontSize: "11px",
  padding: "1px 8px",
  borderRadius: "10px",
  background: "rgba(220,53,69,0.12)",
  color: "var(--danger)",
};

const askBadgeStyle: CSSProperties = {
  fontSize: "11px",
  padding: "1px 8px",
  borderRadius: "10px",
  background: "rgba(255,193,7,0.15)",
  color: "#856404",
};

const pillRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "4px",
  marginBottom: "8px",
};

const monoPathStyle: CSSProperties = {
  fontFamily: "ui-monospace, monospace",
  fontSize: "11px",
  color: "var(--fg-muted)",
  display: "block",
  padding: "1px 0",
};

export default function PermissionsSection({ permissions }: PermissionsSectionProps) {
  const { tools, paths, network } = permissions;
  const hasTools = tools && (tools.allow?.length || tools.deny?.length || tools.ask?.length);
  const hasPaths = paths && (paths.writable?.length || paths.readonly?.length);
  const hasNetwork = network?.["allowed-hosts"]?.length;

  // Determine which sub-section renders first so we can zero its top margin.
  const firstSection = hasTools ? "tools" : hasPaths ? "paths" : "network";
  const labelStyle = (section: string): CSSProperties =>
    section === firstSection ? firstSubLabelStyle : subLabelStyle;

  return (
    <SectionCard
      label="Permissions"
      explanation="Tool access controls, writable paths, and network rules."
    >
      {hasTools && (
        <div>
          <div style={labelStyle("tools")}>Tools</div>
          {tools?.allow && tools.allow.length > 0 && (
            <div style={pillRowStyle}>
              {tools.allow.map((t) => (
                <span key={t} style={allowBadgeStyle}>{t}</span>
              ))}
            </div>
          )}
          {tools?.deny && tools.deny.length > 0 && (
            <div style={pillRowStyle}>
              {tools.deny.map((t) => (
                <span key={t} style={denyBadgeStyle}>{t}</span>
              ))}
            </div>
          )}
          {tools?.ask && tools.ask.length > 0 && (
            <div style={pillRowStyle}>
              {tools.ask.map((t) => (
                <span key={t} style={askBadgeStyle}>{t}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {hasPaths && (
        <div>
          <div style={labelStyle("paths")}>Paths</div>
          {paths?.writable && paths.writable.length > 0 && (
            <div style={{ marginBottom: "6px" }}>
              {paths.writable.map((p) => (
                <code key={p} style={{ ...monoPathStyle, color: "#28a745" }}>{p}</code>
              ))}
            </div>
          )}
          {paths?.readonly && paths.readonly.length > 0 && (
            <div style={{ marginBottom: "6px" }}>
              {paths.readonly.map((p) => (
                <code key={p} style={monoPathStyle}>{p}</code>
              ))}
            </div>
          )}
        </div>
      )}

      {hasNetwork && (
        <div>
          <div style={labelStyle("network")}>Network</div>
          {network?.["allowed-hosts"]?.map((host) => (
            <code key={host} style={monoPathStyle}>{host}</code>
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
