import { useState } from "react";
import type { CSSProperties } from "react";
import type { ClaudeMcpServer } from "../../lib/mcp-types";
import { inferTransport, isNetworkServer } from "../../lib/mcp-types";

interface McpServerCardProps {
  name: string;
  server: ClaudeMcpServer;
  inBoth: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

const transportBadgeStyle: CSSProperties = {
  fontSize: "10px",
  padding: "1px 6px",
  borderRadius: "10px",
  background: "var(--accent-light)",
  color: "var(--accent-text)",
  flexShrink: 0,
};

const inHarnessBadgeStyle: CSSProperties = {
  fontSize: "10px",
  padding: "1px 6px",
  borderRadius: "10px",
  background: "color-mix(in srgb, var(--success, #34c759) 15%, transparent)",
  color: "var(--success, #34c759)",
  flexShrink: 0,
};

export default function McpServerCard({
  name,
  server,
  inBoth,
  onEdit,
  onDelete,
}: McpServerCardProps) {
  const [hovered, setHovered] = useState(false);

  const transport = inferTransport(server);
  const isNetwork = isNetworkServer(server);

  const envCount = !isNetwork ? Object.keys(server.env ?? {}).length : 0;
  const headerCount = isNetwork ? Object.keys(server.headers ?? {}).length : 0;
  const extraCount = isNetwork ? headerCount : envCount;
  const extraLabel = isNetwork
    ? headerCount === 1
      ? "1 header"
      : `${headerCount} headers`
    : envCount === 1
      ? "1 env var"
      : `${envCount} env vars`;

  const commandOrUrl = isNetwork ? server.url : server.command;

  return (
    <div
      className="row-list-item"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      style={{ display: "flex", alignItems: "center", gap: "8px" }}
    >
      {/* Left: name + transport badge + command/url + env count */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <code
            style={{
              fontFamily: "ui-monospace, monospace",
              fontSize: "12px",
              color: "var(--fg-base)",
            }}
          >
            {name}
          </code>
          <span style={transportBadgeStyle}>{transport}</span>
        </div>
        <p
          style={{
            fontSize: "11px",
            color: "var(--fg-muted)",
            margin: "2px 0 0",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {commandOrUrl}
        </p>
        {extraCount > 0 && (
          <p
            style={{
              fontSize: "10px",
              color: "var(--fg-subtle)",
              margin: "1px 0 0",
            }}
          >
            {extraLabel}
          </p>
        )}
      </div>

      {/* Right: inBoth badge + hover action buttons */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          flexShrink: 0,
        }}
      >
        {inBoth && <span style={inHarnessBadgeStyle}>in harness</span>}
        <button
          className="btn btn-secondary btn-sm"
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          style={{ opacity: hovered ? 1 : 0, transition: "opacity 0.15s" }}
          tabIndex={0}
          aria-label={`Edit ${name}`}
        >
          Edit
        </button>
        <button
          className="btn btn-secondary btn-sm"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          style={{ opacity: hovered ? 1 : 0, transition: "opacity 0.15s" }}
          tabIndex={0}
          aria-label={`Delete ${name}`}
        >
          ×
        </button>
      </div>
    </div>
  );
}
