import { Component } from "react";
import type { ReactNode } from "react";
import type { HarnessConfig, HarnessMetadata } from "@harness-kit/core";
import type { YamlPatch } from "../../../lib/harness-yaml-patch";
import MetadataSection from "./MetadataSection";
import PluginsSection from "./PluginsSection";
import McpServersSection from "./McpServersSection";
import EnvSection from "./EnvSection";
import InstructionsSection from "./InstructionsSection";
import PermissionsSection from "./PermissionsSection";
import ExtendsSection from "./ExtendsSection";
import { sanitizeConfig } from "./shape";

interface ProfilePanelProps {
  config: HarnessConfig;
  /**
   * Edits go through here as patches to the YAML text (AC-23). Without it the
   * panel is a read-only view, as for a project's committed team baseline.
   */
  onPatch?: (patch: YamlPatch) => void;
}

const noteStyle = { fontSize: "12px", color: "var(--fg-muted)", margin: 0 } as const;

/**
 * Keeps a render error in the panel from unmounting whatever sits beside it
 * (the editor and its unsaved buffer). Clears itself when the config changes.
 */
class PanelBoundary extends Component<
  { resetKey: unknown; children: ReactNode },
  { failed: boolean; key: unknown }
> {
  state = { failed: false, key: this.props.resetKey };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  static getDerivedStateFromProps(props: { resetKey: unknown }, state: { failed: boolean; key: unknown }) {
    return props.resetKey !== state.key ? { failed: false, key: props.resetKey } : null;
  }

  componentDidCatch(error: unknown) {
    console.error("[ProfilePanel]", error);
  }

  render() {
    if (this.state.failed) {
      return (
        <p role="alert" data-testid="profile-panel-failed" style={noteStyle}>
          The panel couldn&apos;t show this file. Your YAML is untouched; edit it in the editor.
        </p>
      );
    }
    return this.props.children;
  }
}

/**
 * The structured side of Profile: every section of harness.yaml. Editable, it
 * shows the sections a user can add to even when the file has none yet.
 */
export default function ProfilePanel({ config, onPatch }: ProfilePanelProps) {
  return (
    <PanelBoundary resetKey={config}>
      <PanelSections config={config} onPatch={onPatch} />
    </PanelBoundary>
  );
}

function PanelSections({ config: rawConfig, onPatch }: ProfilePanelProps) {
  const editable = onPatch !== undefined;
  const { config, malformed } = sanitizeConfig(rawConfig);
  const bad = (label: string) => malformed.includes(label);
  const plugins = config.plugins ?? [];
  const servers = config["mcp-servers"] ?? {};
  const env = config.env ?? [];
  const extendsList = config.extends ?? [];
  const metadata: HarnessMetadata | undefined = config.metadata ?? (editable && !bad("Metadata") ? { name: "", description: "" } : undefined);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {malformed.map((label) => (
        <p key={label} role="note" data-testid="section-shape-note" style={noteStyle}>
          {label}: this section isn&apos;t in the expected shape. Edit it in the YAML.
        </p>
      ))}
      {metadata && <MetadataSection metadata={metadata} onPatch={onPatch} />}
      {!bad("Plugins") && (editable || plugins.length > 0) && <PluginsSection plugins={plugins} onPatch={onPatch} />}
      {Object.keys(servers).length > 0 && <McpServersSection servers={servers} onPatch={onPatch} />}
      {!bad("Environment") && (editable || env.length > 0) && <EnvSection env={env} onPatch={onPatch} />}
      {!bad("Instructions") && (editable || config.instructions) && <InstructionsSection instructions={config.instructions ?? {}} onPatch={onPatch} />}
      {!bad("Permissions") && (editable || config.permissions) && <PermissionsSection permissions={config.permissions ?? {}} onPatch={onPatch} />}
      {extendsList.length > 0 && <ExtendsSection extends_={extendsList} onPatch={onPatch} />}
    </div>
  );
}
