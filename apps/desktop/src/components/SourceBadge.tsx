export default function SourceBadge({ marketplace }: { marketplace?: string }) {
  if (!marketplace) {
    return (
      <span style={{
        fontSize: "10px", fontWeight: 500, padding: "1px 7px", borderRadius: "10px",
        background: "rgba(217,119,6,0.10)", color: "var(--warning)",
        border: "1px solid rgba(217,119,6,0.25)", whiteSpace: "nowrap",
      }}>
        local
      </span>
    );
  }
  if (marketplace === "harness-kit") {
    return (
      <span style={{
        fontSize: "10px", fontWeight: 500, padding: "1px 7px", borderRadius: "10px",
        background: "rgba(59,130,246,0.12)", color: "#3b82f6",
        border: "1px solid rgba(59,130,246,0.25)", whiteSpace: "nowrap",
      }}>
        official
      </span>
    );
  }
  return (
    <span style={{
      fontSize: "10px", fontWeight: 500, padding: "1px 7px", borderRadius: "10px",
      background: "var(--bg-elevated)", color: "var(--fg-muted)",
      border: "1px solid var(--border-base)", whiteSpace: "nowrap",
    }}>
      {marketplace}
    </span>
  );
}
