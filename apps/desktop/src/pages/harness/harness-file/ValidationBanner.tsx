import type { CSSProperties } from "react";
import type { ValidationResult } from "@harness-kit/core";

interface ValidationBannerProps {
  result: ValidationResult;
}

export default function ValidationBanner({ result }: ValidationBannerProps) {
  if (result.valid && !result.isLegacyFormat) {
    const style: CSSProperties = {
      background: "var(--accent-light)",
      color: "var(--accent-text)",
      borderRadius: "8px",
      padding: "10px 12px",
      fontSize: "13px",
      display: "flex",
      alignItems: "center",
      gap: "6px",
    };
    return (
      <div style={style}>
        <span>✓</span>
        <span>Valid harness.yaml</span>
      </div>
    );
  }

  if (result.isLegacyFormat) {
    const style: CSSProperties = {
      background: "var(--bg-surface)",
      color: "var(--fg-muted)",
      border: "1px solid var(--border-base)",
      borderRadius: "8px",
      padding: "10px 12px",
      fontSize: "13px",
    };
    return (
      <div style={style}>
        Legacy format detected — consider upgrading to Protocol v1
      </div>
    );
  }

  const MAX_SHOWN = 5;
  const shown = result.errors.slice(0, MAX_SHOWN);
  const overflow = result.errors.length - MAX_SHOWN;

  const style: CSSProperties = {
    background: "var(--bg-surface)",
    color: "var(--danger)",
    border: "1px solid var(--border-base)",
    borderRadius: "8px",
    padding: "10px 12px",
    fontSize: "13px",
  };

  const listStyle: CSSProperties = {
    margin: "6px 0 0",
    paddingLeft: "16px",
    fontSize: "12px",
    lineHeight: "1.6",
  };

  return (
    <div style={style}>
      <span style={{ fontWeight: 600 }}>Validation errors:</span>
      <ul style={listStyle}>
        {shown.map((err, i) => (
          <li key={i}>{err.message}</li>
        ))}
        {overflow > 0 && (
          <li style={{ color: "var(--fg-muted)" }}>+{overflow} more</li>
        )}
      </ul>
    </div>
  );
}
