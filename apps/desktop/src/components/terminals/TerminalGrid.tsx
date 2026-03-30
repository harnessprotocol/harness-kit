// ── Types ────────────────────────────────────────────────────

export interface TerminalGridProps {
  children: React.ReactNode;
  count: number;
}

// ── Grid column rules (matches Auto-Claude layout) ──────────

function getColumns(count: number): number {
  if (count <= 1) return 1;
  if (count <= 3) return count; // 2 → 2, 3 → 3
  if (count === 4) return 2;    // 2x2
  if (count <= 9) return 3;     // 5-9 → 3 columns
  return 4;                     // 10-12 → 4 columns
}

// ── Component ────────────────────────────────────────────────

export default function TerminalGrid({ children, count }: TerminalGridProps) {
  const columns = getColumns(count);
  const rows = Math.ceil(count / columns);

  const gridStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: `repeat(${columns}, 1fr)`,
    gridTemplateRows: `repeat(${rows}, 1fr)`,
    gap: 1,
    flex: 1,
    minHeight: 0,
    background: "#1a1816",
    overflow: "hidden",
  };

  return <div style={gridStyle}>{children}</div>;
}
