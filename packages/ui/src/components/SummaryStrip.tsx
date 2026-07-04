import type { ReactNode } from "react";

export type SummaryTone = "default" | "success" | "warning" | "danger" | "accent";

export interface SummaryCell {
  id: string;
  label: string;
  value: ReactNode;
  tone?: SummaryTone;
}

export interface SummaryStripProps {
  cells: SummaryCell[];
  className?: string;
}

/**
 * A single elevated bar, cells divided by a hairline inset. Used for the
 * Fleet page head (Harnesses / Projects / Drifted / Coverage / Last compiled)
 * — DESIGN.md §6.
 */
export function SummaryStrip({ cells, className = "" }: SummaryStripProps) {
  return (
    <div className={["hk-summary-strip", className].filter(Boolean).join(" ")}>
      {cells.map((cell) => (
        <div key={cell.id} className="hk-summary-cell">
          <div className="hk-summary-label">{cell.label}</div>
          <div className="hk-summary-value" data-tone={cell.tone ?? "default"}>
            {cell.value}
          </div>
        </div>
      ))}
    </div>
  );
}
