import type { CSSProperties } from "react";

export interface StatProps {
  label: string;
  value: string;
  sub?: string;
  /** Top accent bar color; defaults to --accent. Pass a token var, e.g. "var(--warning)". */
  accent?: string;
  className?: string;
}

/** A single metric tile (label + value + optional sub-caption). Borderless. */
export function Stat({ label, value, sub, accent, className = "" }: StatProps) {
  const style = accent ? ({ "--stat-accent": accent } as CSSProperties) : undefined;
  return (
    <div className={["hk-stat", className].filter(Boolean).join(" ")} style={style}>
      <div className="hk-stat-value">{value}</div>
      <div className="hk-stat-label">{label}</div>
      {sub && <div className="hk-stat-sub">{sub}</div>}
    </div>
  );
}
