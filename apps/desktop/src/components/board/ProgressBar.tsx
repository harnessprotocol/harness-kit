interface Props {
  completed: number;
  total: number;
  height?: number;
}

export function ProgressBar({ completed, total, height = 4 }: Props) {
  if (total === 0) return null;
  const percent = Math.round((completed / total) * 100);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div
        style={{
          flex: 1,
          height,
          borderRadius: height / 2,
          background: "var(--bg-base)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${percent}%`,
            height: "100%",
            borderRadius: height / 2,
            background: percent === 100 ? "var(--success)" : "var(--accent)",
            transition: "width 0.3s ease",
          }}
        />
      </div>
      <span
        style={{
          fontSize: 10,
          color: "var(--text-muted)",
          fontVariantNumeric: "tabular-nums",
          whiteSpace: "nowrap",
        }}
      >
        {completed}/{total}
      </span>
    </div>
  );
}
