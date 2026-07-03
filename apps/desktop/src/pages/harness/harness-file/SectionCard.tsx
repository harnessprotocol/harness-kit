import type { CSSProperties } from "react";
import { Card } from "@harness-kit/ui";

interface SectionCardProps {
  label: string;
  explanation: string;
  count?: number;
  children: React.ReactNode;
}

const labelStyle: CSSProperties = {
  fontSize: "10.5px",
  fontWeight: 650,
  letterSpacing: "0.07em",
  textTransform: "uppercase",
  color: "var(--fg-subtle)",
  display: "flex",
  alignItems: "center",
  gap: "6px",
};

const countBadgeStyle: CSSProperties = {
  fontSize: "10px",
  fontWeight: 500,
  padding: "0 6px",
  borderRadius: "10px",
  background: "var(--bg-elevated)",
  color: "var(--fg-subtle)",
  lineHeight: "16px",
};

const explanationStyle: CSSProperties = {
  fontSize: "11px",
  fontStyle: "italic",
  color: "var(--fg-muted)",
  margin: "2px 0 0",
};

export default function SectionCard({ label, explanation, count, children }: SectionCardProps) {
  return (
    <div>
      <div style={labelStyle}>
        <span>{label}</span>
        {count !== undefined && (
          <span style={countBadgeStyle}>{count}</span>
        )}
      </div>
      <p style={explanationStyle}>{explanation}</p>
      <Card padding="sm" style={{ marginTop: "8px" }}>{children}</Card>
    </div>
  );
}
