import type { CSSProperties } from "react";

interface SectionCardProps {
  label: string;
  explanation: string;
  count?: number;
  children: React.ReactNode;
}

const labelStyle: CSSProperties = {
  fontSize: "10px",
  fontWeight: 600,
  letterSpacing: "0.06em",
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

const cardStyle: CSSProperties = {
  background: "var(--bg-surface)",
  border: "1px solid var(--border-base)",
  borderRadius: "8px",
  padding: "12px",
  marginTop: "8px",
};

export default function SectionCard({ label, explanation, count, children }: SectionCardProps) {
  return (
    <div>
      <div style={labelStyle}>
        <span>{label}</span>
        {count !== undefined && <span style={countBadgeStyle}>{count}</span>}
      </div>
      <p style={explanationStyle}>{explanation}</p>
      <div style={cardStyle}>{children}</div>
    </div>
  );
}
