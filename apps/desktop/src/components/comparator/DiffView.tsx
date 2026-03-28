import { useState, useMemo, useEffect, Fragment } from "react";

// ── ANSI strip ──────────────────────────────────────────────

/** Strip ANSI escape codes (colors, cursor moves, etc.) from terminal output. */
function stripAnsi(text: string): string {
  // Covers SGR, CSI sequences, OSC sequences, and other common escapes
  return text.replace(
    // eslint-disable-next-line no-control-regex
    /[\u001b\u009b][\[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><~]/g,
    "",
  );
}

// ── LCS diff ────────────────────────────────────────────────

type DiffOp = "equal" | "insert" | "delete";

interface DiffLine {
  op: DiffOp;
  leftLine: string | null;   // null when op === "insert"
  rightLine: string | null;  // null when op === "delete"
  leftNum: number | null;
  rightNum: number | null;
}

/**
 * Compute a side-by-side diff of two string arrays using LCS (longest common
 * subsequence).  Returns an array of DiffLine entries suitable for rendering.
 *
 * For large inputs we bail out of full O(n*m) LCS and fall back to a simpler
 * line-equality scan to keep the UI responsive.
 */
function computeDiff(leftLines: string[], rightLines: string[]): DiffLine[] {
  const n = leftLines.length;
  const m = rightLines.length;

  // For very large outputs, fall back to a simple equal/delete/insert scan
  // to avoid allocating a huge LCS table.
  const MAX_CELLS = 2_000_000;
  if (n * m > MAX_CELLS) {
    return simpleDiff(leftLines, rightLines);
  }

  // Build LCS length table
  const dp: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (leftLines[i - 1] === rightLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to produce diff ops
  const result: DiffLine[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && leftLines[i - 1] === rightLines[j - 1]) {
      result.push({
        op: "equal",
        leftLine: leftLines[i - 1],
        rightLine: rightLines[j - 1],
        leftNum: i,
        rightNum: j,
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.push({
        op: "insert",
        leftLine: null,
        rightLine: rightLines[j - 1],
        leftNum: null,
        rightNum: j,
      });
      j--;
    } else {
      result.push({
        op: "delete",
        leftLine: leftLines[i - 1],
        rightLine: null,
        leftNum: i,
        rightNum: null,
      });
      i--;
    }
  }
  result.reverse();
  return result;
}

/** Fallback diff for very large inputs — O(n+m) line-pair scan. */
function simpleDiff(leftLines: string[], rightLines: string[]): DiffLine[] {
  const result: DiffLine[] = [];
  let li = 0;
  let ri = 0;
  while (li < leftLines.length && ri < rightLines.length) {
    if (leftLines[li] === rightLines[ri]) {
      result.push({
        op: "equal",
        leftLine: leftLines[li],
        rightLine: rightLines[ri],
        leftNum: li + 1,
        rightNum: ri + 1,
      });
      li++;
      ri++;
    } else {
      // Scan ahead in right for a match of the current left line
      let foundRight = -1;
      for (let k = ri + 1; k < Math.min(ri + 50, rightLines.length); k++) {
        if (rightLines[k] === leftLines[li]) { foundRight = k; break; }
      }
      // Scan ahead in left for a match of the current right line
      let foundLeft = -1;
      for (let k = li + 1; k < Math.min(li + 50, leftLines.length); k++) {
        if (leftLines[k] === rightLines[ri]) { foundLeft = k; break; }
      }

      if (foundRight !== -1 && (foundLeft === -1 || (foundRight - ri) <= (foundLeft - li))) {
        // Emit right-side insertions up to the match
        while (ri < foundRight) {
          result.push({ op: "insert", leftLine: null, rightLine: rightLines[ri], leftNum: null, rightNum: ri + 1 });
          ri++;
        }
      } else if (foundLeft !== -1) {
        // Emit left-side deletions up to the match
        while (li < foundLeft) {
          result.push({ op: "delete", leftLine: leftLines[li], rightLine: null, leftNum: li + 1, rightNum: null });
          li++;
        }
      } else {
        // No nearby match — emit one delete + one insert
        result.push({ op: "delete", leftLine: leftLines[li], rightLine: null, leftNum: li + 1, rightNum: null });
        li++;
        result.push({ op: "insert", leftLine: null, rightLine: rightLines[ri], leftNum: null, rightNum: ri + 1 });
        ri++;
      }
    }
  }
  while (li < leftLines.length) {
    result.push({ op: "delete", leftLine: leftLines[li], rightLine: null, leftNum: li + 1, rightNum: null });
    li++;
  }
  while (ri < rightLines.length) {
    result.push({ op: "insert", leftLine: null, rightLine: rightLines[ri], leftNum: null, rightNum: ri + 1 });
    ri++;
  }
  return result;
}

// ── Component ───────────────────────────────────────────────

export interface OutputPanel {
  panelId: string;
  harnessName: string;
  model?: string;
  outputText: string;
}

interface DiffViewProps {
  panels: OutputPanel[];
}

const MONO_FAMILY = "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace";

/** Minimum consecutive equal lines before collapsing into a fold. */
const FOLD_THRESHOLD = 5;

/**
 * Group diff lines into renderable rows, collapsing long runs of equal lines
 * into fold markers.
 */
type RenderRow =
  | { kind: "line"; line: DiffLine; index: number }
  | { kind: "fold"; rangeKey: string; startIndex: number; count: number; lines: DiffLine[] };

function buildRenderRows(diffLines: DiffLine[]): RenderRow[] {
  const rows: RenderRow[] = [];
  let i = 0;
  while (i < diffLines.length) {
    if (diffLines[i].op === "equal") {
      // Count consecutive equal lines
      let j = i;
      while (j < diffLines.length && diffLines[j].op === "equal") j++;
      const count = j - i;
      if (count >= FOLD_THRESHOLD) {
        rows.push({
          kind: "fold",
          rangeKey: `fold-${i}`,
          startIndex: i,
          count,
          lines: diffLines.slice(i, j),
        });
        i = j;
      } else {
        for (; i < j; i++) {
          rows.push({ kind: "line", line: diffLines[i], index: i });
        }
      }
    } else {
      rows.push({ kind: "line", line: diffLines[i], index: i });
      i++;
    }
  }
  return rows;
}

export default function DiffView({ panels }: DiffViewProps) {
  const [leftIdx, setLeftIdx] = useState(0);
  const [rightIdx, setRightIdx] = useState(Math.min(1, panels.length - 1));
  const [expandedFolds, setExpandedFolds] = useState<Set<string>>(new Set());

  // Reset expanded folds when panel selection changes
  const toggleFold = (key: string) => {
    setExpandedFolds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Compute diff between selected panels
  const diffLines = useMemo(() => {
    if (panels.length < 2) return [];
    const leftText = stripAnsi(panels[leftIdx]?.outputText ?? "");
    const rightText = stripAnsi(panels[rightIdx]?.outputText ?? "");
    const left = leftText.split("\n");
    const right = rightText.split("\n");
    return computeDiff(left, right);
  }, [panels, leftIdx, rightIdx]);

  // Reset folds when diff changes
  useEffect(() => { setExpandedFolds(new Set()); }, [diffLines]);

  // Build render rows with folding
  const renderRows = useMemo(() => buildRenderRows(diffLines), [diffLines]);

  // Stats
  const stats = useMemo(() => {
    let added = 0;
    let removed = 0;
    let unchanged = 0;
    for (const d of diffLines) {
      if (d.op === "insert") added++;
      else if (d.op === "delete") removed++;
      else unchanged++;
    }
    const totalDiffer = added + removed;
    const totalLines = added + removed + unchanged;
    return { added, removed, unchanged, totalDiffer, totalLines };
  }, [diffLines]);

  if (panels.length < 2) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          padding: "40px",
          color: "var(--fg-subtle)",
          fontSize: "13px",
          textAlign: "center",
        }}
      >
        <div>
          <p style={{ fontWeight: 500, marginBottom: "4px" }}>
            Need at least 2 panels to compare
          </p>
          <p style={{ fontSize: "11px" }}>
            Run a comparison with multiple tools to see how their outputs differ.
          </p>
        </div>
      </div>
    );
  }

  const panelLabel = (p: OutputPanel) =>
    p.model ? `${p.harnessName} (${p.model})` : p.harnessName;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Summary header */}
      {leftIdx !== rightIdx && (
        <div className="diff-summary-header">
          Comparing <strong>{panelLabel(panels[leftIdx])}</strong> vs{" "}
          <strong>{panelLabel(panels[rightIdx])}</strong>
          {" \u2014 "}
          {stats.totalDiffer} line{stats.totalDiffer !== 1 ? "s" : ""} differ out of {stats.totalLines}
        </div>
      )}

      {/* Selector bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          padding: "8px 16px",
          borderBottom: "1px solid var(--border-base)",
          background: "var(--bg-surface)",
          flexShrink: 0,
          fontSize: "12px",
        }}
      >
        <label style={{ color: "var(--fg-muted)", display: "flex", alignItems: "center", gap: "6px" }}>
          Left:
          <select
            value={leftIdx}
            onChange={(e) => setLeftIdx(Number(e.target.value))}
            style={{
              background: "var(--bg-base)",
              color: "var(--fg-base)",
              border: "1px solid var(--border-base)",
              borderRadius: "4px",
              padding: "3px 6px",
              fontSize: "11px",
              fontFamily: MONO_FAMILY,
            }}
          >
            {panels.map((p, i) => (
              <option key={p.panelId} value={i}>
                {panelLabel(p)}
              </option>
            ))}
          </select>
        </label>

        <span style={{ color: "var(--fg-subtle)" }}>vs</span>

        <label style={{ color: "var(--fg-muted)", display: "flex", alignItems: "center", gap: "6px" }}>
          Right:
          <select
            value={rightIdx}
            onChange={(e) => setRightIdx(Number(e.target.value))}
            style={{
              background: "var(--bg-base)",
              color: "var(--fg-base)",
              border: "1px solid var(--border-base)",
              borderRadius: "4px",
              padding: "3px 6px",
              fontSize: "11px",
              fontFamily: MONO_FAMILY,
            }}
          >
            {panels.map((p, i) => (
              <option key={p.panelId} value={i}>
                {panelLabel(p)}
              </option>
            ))}
          </select>
        </label>

        <div style={{ marginLeft: "auto", display: "flex", gap: "12px", fontSize: "11px" }}>
          {stats.removed > 0 && (
            <span style={{ color: "var(--danger)" }}>-{stats.removed} removed</span>
          )}
          {stats.added > 0 && (
            <span style={{ color: "var(--success)" }}>+{stats.added} added</span>
          )}
          <span style={{ color: "var(--fg-subtle)" }}>
            {stats.unchanged} unchanged
          </span>
        </div>
      </div>

      {/* Column headers */}
      <div
        style={{
          display: "flex",
          flexShrink: 0,
          borderBottom: "1px solid var(--border-base)",
          background: "var(--bg-surface)",
        }}
      >
        <div
          style={{
            flex: 1,
            padding: "6px 16px",
            fontSize: "11px",
            fontWeight: 600,
            color: "var(--fg-base)",
            fontFamily: MONO_FAMILY,
            borderRight: "1px solid var(--border-base)",
          }}
        >
          {panelLabel(panels[leftIdx])}
        </div>
        <div
          style={{
            flex: 1,
            padding: "6px 16px",
            fontSize: "11px",
            fontWeight: 600,
            color: "var(--fg-base)",
            fontFamily: MONO_FAMILY,
          }}
        >
          {panelLabel(panels[rightIdx])}
        </div>
      </div>

      {/* Same-panel warning */}
      {leftIdx === rightIdx && (
        <div
          style={{
            padding: "12px 16px",
            fontSize: "11px",
            color: "var(--fg-subtle)",
            background: "var(--bg-surface)",
            borderBottom: "1px solid var(--border-base)",
          }}
        >
          Both sides are the same panel. Select different panels to see differences.
        </div>
      )}

      {/* Diff content */}
      <div
        style={{
          flex: 1,
          overflowX: "auto",
          overflowY: "auto",
          fontFamily: MONO_FAMILY,
          fontSize: "11px",
          lineHeight: "1.6",
        }}
      >
        {diffLines.length === 0 && leftIdx !== rightIdx ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              color: "var(--fg-subtle)",
              fontSize: "12px",
            }}
          >
            Both panels produced identical output.
          </div>
        ) : (
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
            }}
          >
            <tbody>
              {renderRows.map((row) => {
                if (row.kind === "fold") {
                  const isExpanded = expandedFolds.has(row.rangeKey);
                  if (isExpanded) {
                    // Render all the equal lines in this fold
                    return (
                      <Fragment key={row.rangeKey}>
                        {row.lines.map((d, fi) => (
                          <DiffLineRow key={`${row.rangeKey}-${fi}`} d={d} />
                        ))}
                      </Fragment>
                    );
                  }
                  // Render collapsed fold marker
                  return (
                    <tr
                      key={row.rangeKey}
                      className="diff-fold-row"
                      onClick={() => toggleFold(row.rangeKey)}
                    >
                      <td
                        colSpan={4}
                        className="diff-fold-label"
                      >
                        {"\u2014"} {row.count} unchanged lines {"\u2014"}
                      </td>
                    </tr>
                  );
                }
                return <DiffLineRow key={row.index} d={row.line} />;
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/** Single diff line row — extracted for reuse in fold expansion. */
function DiffLineRow({ d }: { d: DiffLine }) {
  let leftBg = "transparent";
  let rightBg = "transparent";
  let leftColor = "var(--fg-muted)";
  let rightColor = "var(--fg-muted)";

  if (d.op === "delete") {
    leftBg = "rgba(220, 38, 38, 0.08)";
    leftColor = "var(--danger)";
  } else if (d.op === "insert") {
    rightBg = "rgba(22, 163, 74, 0.1)";
    rightColor = "var(--success)";
  }

  return (
    <tr>
      {/* Left line number */}
      <td
        style={{
          width: "36px",
          padding: "0 6px",
          textAlign: "right",
          color: "var(--fg-subtle)",
          background: d.op === "delete" ? "rgba(220, 38, 38, 0.05)" : "var(--bg-surface)",
          borderRight: "1px solid var(--border-base)",
          userSelect: "none",
          fontSize: "10px",
          verticalAlign: "top",
        }}
      >
        {d.leftNum ?? ""}
      </td>
      {/* Left content */}
      <td
        style={{
          padding: "0 10px",
          background: leftBg,
          color: leftColor,
          whiteSpace: "pre-wrap",
          wordBreak: "break-all",
          minHeight: "1.6em",
          borderRight: "1px solid var(--border-base)",
          verticalAlign: "top",
        }}
      >
        {d.leftLine ?? ""}
      </td>
      {/* Right line number */}
      <td
        style={{
          width: "36px",
          padding: "0 6px",
          textAlign: "right",
          color: "var(--fg-subtle)",
          background: d.op === "insert" ? "rgba(22, 163, 74, 0.06)" : "var(--bg-surface)",
          borderRight: "1px solid var(--border-base)",
          userSelect: "none",
          fontSize: "10px",
          verticalAlign: "top",
        }}
      >
        {d.rightNum ?? ""}
      </td>
      {/* Right content */}
      <td
        style={{
          padding: "0 10px",
          background: rightBg,
          color: rightColor,
          whiteSpace: "pre-wrap",
          wordBreak: "break-all",
          minHeight: "1.6em",
          verticalAlign: "top",
        }}
      >
        {d.rightLine ?? ""}
      </td>
    </tr>
  );
}
