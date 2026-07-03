export type DiffOp = "add" | "remove" | "context";

export interface DiffLine {
  op: DiffOp;
  /** Left-hand line number (removed/context lines). */
  oldLineNo?: number | string;
  /** Right-hand line number (added/context lines). */
  newLineNo?: number | string;
  content: string;
}

export interface DiffViewerProps {
  lines: DiffLine[];
  className?: string;
}

const PREFIX: Record<DiffOp, string> = {
  add: "+",
  remove: "-",
  context: " ",
};

/**
 * Mono diff viewer with red/green gutters (danger/success tints), used by the
 * Drift screen (DESIGN.md §6). No syntax highlighting engine bundled —
 * consumers can wrap `content` with a highlighter if needed.
 */
export function DiffViewer({ lines, className = "" }: DiffViewerProps) {
  return (
    <div className={["hk-diff", className].filter(Boolean).join(" ")}>
      {lines.map((line, i) => (
        <div className="hk-diff-line" data-op={line.op} key={i}>
          <span className="hk-diff-gutter">{PREFIX[line.op]}</span>
          <span className="hk-diff-content">{line.content}</span>
        </div>
      ))}
    </div>
  );
}
