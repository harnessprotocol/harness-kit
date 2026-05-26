import Tooltip from "../Tooltip";
import { Card } from "./Card";

interface StatProps {
  label: string;
  value: string;
  sub?: string;
  tooltip?: string;
  /** Top accent bar color; defaults to the brand accent. */
  accent?: string;
}

/** A single metric tile (label + value + optional sub/tooltip). Borderless. */
export function Stat({ label, value, sub, tooltip, accent }: StatProps) {
  const labelEl = (
    <span
      style={{
        fontSize: "11px",
        fontWeight: 500,
        fontVariantCaps: "all-small-caps",
        letterSpacing: "0.03em",
        color: "var(--fg-subtle)",
        ...(tooltip ? { borderBottom: "1px dotted var(--fg-subtle)", cursor: "help" } : {}),
      }}
    >
      {label}
    </span>
  );

  return (
    <Card glass accentColor={accent ?? "var(--accent)"} style={{ flex: 1, padding: "12px 16px" }}>
      <div
        style={{
          fontSize: "22px",
          fontWeight: 700,
          letterSpacing: "-0.5px",
          color: "var(--fg-base)",
          lineHeight: 1.1,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
      <div style={{ marginTop: "5px" }}>
        {tooltip ? (
          <Tooltip content={tooltip} position="bottom">
            {labelEl}
          </Tooltip>
        ) : (
          labelEl
        )}
      </div>
      {sub && <div style={{ fontSize: "10px", color: "var(--fg-subtle)", marginTop: "2px" }}>{sub}</div>}
    </Card>
  );
}
