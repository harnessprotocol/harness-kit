import type { ReactNode } from "react";

export type SummaryTone = "default" | "success" | "warning" | "danger" | "accent";

export interface SummaryCell {
  id: string;
  label: string;
  value: ReactNode;
  tone?: SummaryTone;
  /** Makes the cell a toggle button, e.g. a filter. Omit for a plain cell. */
  onSelect?: () => void;
  /** Pressed state of a cell with `onSelect`. */
  active?: boolean;
}

export interface SummaryStripProps {
  cells: SummaryCell[];
  className?: string;
}

/**
 * A single elevated bar, cells divided by a hairline inset. Used for the
 * Fleet page head (Harnesses / Projects / Drifted / Coverage / Last compiled)
 * — DESIGN.md §6. A cell with `onSelect` renders as a toggle button with the
 * same inner markup; every other cell is a plain div.
 */
export function SummaryStrip({ cells, className = "" }: SummaryStripProps) {
  return (
    <div className={["hk-summary-strip", className].filter(Boolean).join(" ")}>
      {cells.map((cell) => {
        const content = (
          <>
            <div className="hk-summary-label">{cell.label}</div>
            <div className="hk-summary-value" data-tone={cell.tone ?? "default"}>
              {cell.value}
            </div>
          </>
        );
        if (!cell.onSelect) {
          return (
            <div key={cell.id} className="hk-summary-cell">
              {content}
            </div>
          );
        }
        const active = cell.active ?? false;
        return (
          <button
            key={cell.id}
            type="button"
            className="hk-summary-cell"
            aria-pressed={active}
            data-active={active ? "true" : undefined}
            onClick={cell.onSelect}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}
