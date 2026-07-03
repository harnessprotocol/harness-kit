import type { CSSProperties } from "react";
import { CheckCircle2 } from "lucide-react";
import { Card } from "@harness-kit/ui";
import type { ValidationResult } from "@harness-kit/core";

interface ValidationBannerProps {
  result: ValidationResult;
}

export default function ValidationBanner({ result }: ValidationBannerProps) {
  if (result.valid && !result.isLegacyFormat) {
    return (
      <Card
        padding="sm"
        style={{
          background: "var(--accent-light)",
          color: "var(--accent-text)",
          fontSize: "13px",
          display: "flex",
          alignItems: "center",
          gap: "6px",
        }}
      >
        <CheckCircle2 size={14} strokeWidth={1.7} aria-hidden="true" />
        <span>Valid harness.yaml</span>
      </Card>
    );
  }

  if (result.isLegacyFormat) {
    return (
      <Card padding="sm" style={{ color: "var(--fg-muted)", fontSize: "13px" }}>
        Legacy format detected — consider upgrading to Protocol v1
      </Card>
    );
  }

  const MAX_SHOWN = 5;
  const shown = result.errors.slice(0, MAX_SHOWN);
  const overflow = result.errors.length - MAX_SHOWN;

  const listStyle: CSSProperties = {
    margin: "6px 0 0",
    paddingLeft: "16px",
    fontSize: "12px",
    lineHeight: "1.6",
  };

  return (
    <Card padding="sm" style={{ color: "var(--danger)", fontSize: "13px" }}>
      <span style={{ fontWeight: 600 }}>Validation errors:</span>
      <ul style={listStyle}>
        {shown.map((err, i) => (
          <li key={i}>{err.message}</li>
        ))}
        {overflow > 0 && (
          <li style={{ color: "var(--fg-muted)" }}>+{overflow} more</li>
        )}
      </ul>
    </Card>
  );
}
