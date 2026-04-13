import type { InstalledPlugin, PluginUpdateInfo } from "@harness-kit/shared";
import { motion } from "framer-motion";
import SourceBadge from "../../../components/SourceBadge";
import { formatComponentCounts, relativeDate } from "../../../lib/plugin-utils";

interface PluginRowProps {
  plugin: InstalledPlugin;
  update?: PluginUpdateInfo;
  index: number;
  isLast: boolean;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

export default function PluginRow({
  plugin,
  update,
  index,
  isLast,
  onClick,
  onContextMenu,
}: PluginRowProps) {
  const counts = formatComponentCounts(plugin.component_counts);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.3), duration: 0.2 }}
      onClick={onClick}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(e);
      }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "10px 14px",
        borderBottom: isLast ? "none" : "1px solid var(--border-subtle)",
        cursor: "pointer",
        boxShadow: update ? "inset 3px 0 0 var(--accent)" : undefined,
      }}
      whileHover={{ backgroundColor: "var(--hover-bg)" }}
    >
      {/* Left zone: name, description, counts, tags */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--fg-base)" }}>
            {plugin.name}
          </span>
          <SourceBadge marketplace={plugin.marketplace} />
        </div>

        <p
          style={{
            fontSize: "11px",
            color: "var(--fg-muted)",
            margin: "1px 0 0",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {plugin.description || <em style={{ color: "var(--fg-subtle)" }}>No description</em>}
        </p>

        {(counts || (plugin.tags && plugin.tags.length > 0)) && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              marginTop: "3px",
              flexWrap: "wrap",
            }}
          >
            {counts && (
              <span style={{ fontSize: "10px", color: "var(--fg-subtle)" }}>{counts}</span>
            )}
            {plugin.tags?.map((tag) => (
              <span
                key={tag}
                style={{
                  fontSize: "10px",
                  padding: "0 5px",
                  borderRadius: "3px",
                  border: "1px solid var(--border-subtle)",
                  color: "var(--fg-subtle)",
                  lineHeight: "16px",
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Right zone: version + date */}
      <div style={{ flexShrink: 0, textAlign: "right" }}>
        <div
          style={{
            fontFamily: "ui-monospace, monospace",
            fontSize: "11px",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {update ? (
            <span>
              <span style={{ color: "var(--fg-subtle)", textDecoration: "line-through" }}>
                {plugin.version}
              </span>
              <span style={{ color: "var(--accent-text)", marginLeft: 4 }}>
                → {update.latest_version}
              </span>
            </span>
          ) : (
            <span style={{ color: "var(--fg-subtle)" }}>{plugin.version}</span>
          )}
        </div>
        <div style={{ fontSize: "11px", color: "var(--fg-subtle)", marginTop: "1px" }}>
          {relativeDate(plugin.installed_at)}
        </div>
      </div>
    </motion.div>
  );
}
