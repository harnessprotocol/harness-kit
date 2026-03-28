interface FileDiff {
  filePath: string;
  diffText: string;
  changeType: string;
}

interface DiffCompareViewProps {
  filePath: string;
  leftLabel: string;
  rightLabel: string;
  leftDiff: FileDiff | null;
  rightDiff: FileDiff | null;
  onClose?: () => void;
}

function renderDiffLines(diffText: string) {
  return diffText.split("\n").map((line, i) => {
    let bg = "transparent";
    let color = "var(--fg-muted)";
    if (line.startsWith("+") && !line.startsWith("+++")) {
      bg = "rgba(22, 163, 74, 0.1)";
      color = "var(--success)";
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      bg = "rgba(220, 38, 38, 0.08)";
      color = "var(--danger)";
    } else if (line.startsWith("@@")) {
      color = "var(--accent-text)";
    }
    return (
      <div
        key={i}
        style={{
          padding: "0 10px",
          background: bg,
          color,
          whiteSpace: "pre",
          minHeight: "1.6em",
        }}
      >
        {line}
      </div>
    );
  });
}

export default function DiffCompareView({
  filePath, leftLabel, rightLabel, leftDiff, rightDiff, onClose,
}: DiffCompareViewProps) {
  return (
    <div className="diff-compare-view">
      <div className="diff-compare-header">
        <span className="diff-compare-path">{filePath}</span>
        {onClose && (
          <button className="btn btn-xs btn-secondary" onClick={onClose}>
            Close
          </button>
        )}
      </div>

      <div className="diff-compare-columns">
        {[
          { label: leftLabel, diff: leftDiff },
          { label: rightLabel, diff: rightDiff },
        ].map(({ label, diff }) => (
          <div key={label} className="diff-compare-col">
            <div className="diff-compare-col-header">Panel {label}</div>
            <div className="diff-compare-col-content">
              {diff ? (
                renderDiffLines(diff.diffText)
              ) : (
                <div style={{ padding: "12px", color: "var(--fg-subtle)", fontSize: "11px" }}>
                  No changes to this file
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
