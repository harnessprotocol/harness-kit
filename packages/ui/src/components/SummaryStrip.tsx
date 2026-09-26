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
 * Machine page head (DESIGN.md §6). A cell with `onSelect` renders as a
 * toggle button with the same inner markup; every other cell is a plain div.
 */
export function SummaryStrip({ cells, className = "" }: SummaryStripProps) {
  return (
    <div className={["hk-summary-strip", className].filter(Boolean).join(" ")}>
      {cells.map((cell) => {
        // Spans, not divs: a selectable cell renders as a <button>, which may
        // only hold phrasing content. The classes set display: block.
        const content = (
          <>
            <span className="hk-summary-label">{cell.label}</span>
            <span className="hk-summary-value" data-tone={cell.tone ?? "default"}>
              {cell.value}
            </span>
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
            // The label and value are adjacent spans with no text between
            // them, so the computed name would read "Gaps1".
            aria-label={
              typeof cell.value === "string" || typeof cell.value === "number"
                ? `${cell.label} ${cell.value}`
                : undefined
            }
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
