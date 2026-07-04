import type { DiffLine } from "@harness-kit/ui";

/**
 * Minimal line-based diff (classic LCS backtrace) producing DiffViewer's
 * DiffLine[] shape. Config/instruction files here are small (a few hundred
 * lines at most), so the O(n*m) LCS table is cheap — no need for a diff
 * library dependency for this.
 */
export function lineDiff(before: string, after: string): DiffLine[] {
  const a = before.length === 0 ? [] : before.split("\n");
  const b = after.length === 0 ? [] : after.split("\n");

  const n = a.length;
  const m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));

  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;
  let oldNo = 1;
  let newNo = 1;

  while (i < n && j < m) {
    if (a[i] === b[j]) {
      lines.push({ op: "context", oldLineNo: oldNo++, newLineNo: newNo++, content: a[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      lines.push({ op: "remove", oldLineNo: oldNo++, content: a[i] });
      i++;
    } else {
      lines.push({ op: "add", newLineNo: newNo++, content: b[j] });
      j++;
    }
  }
  while (i < n) {
    lines.push({ op: "remove", oldLineNo: oldNo++, content: a[i] });
    i++;
  }
  while (j < m) {
    lines.push({ op: "add", newLineNo: newNo++, content: b[j] });
    j++;
  }

  return lines;
}

/** Collapse to just the changed hunks (+/- a few lines of context) — full-file
 *  diffs are noisy for a single-slot marker change. */
export function collapseToHunks(lines: DiffLine[], context = 3): DiffLine[] {
  const changedIdx = lines
    .map((l, idx) => (l.op !== "context" ? idx : -1))
    .filter((idx) => idx !== -1);
  if (changedIdx.length === 0) return lines.slice(0, Math.min(lines.length, context * 2));

  const keep = new Set<number>();
  for (const idx of changedIdx) {
    for (let k = Math.max(0, idx - context); k <= Math.min(lines.length - 1, idx + context); k++) {
      keep.add(k);
    }
  }

  const sorted = [...keep].sort((x, y) => x - y);
  const result: DiffLine[] = [];
  let prev = -2;
  for (const idx of sorted) {
    if (idx !== prev + 1 && result.length > 0) {
      result.push({ op: "context", content: "⋯" });
    }
    result.push(lines[idx]);
    prev = idx;
  }
  return result;
}
