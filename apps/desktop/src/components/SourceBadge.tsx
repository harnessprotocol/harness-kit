export default function SourceBadge({ marketplace }: { marketplace?: string }) {
  if (!marketplace) {
    return (
      <span style={{
        fontSize: "10px", fontWeight: 500, padding: "1px 7px", borderRadius: "10px",
        background: "var(--warning-light)", color: "var(--warning)",
        border: "1px solid var(--warning-light)", whiteSpace: "nowrap",
      }}>
        local
      </span>
    );
  }
  if (marketplace === "harness-kit") {
    return (
      <span style={{
        fontSize: "10px", fontWeight: 500, padding: "1px 7px", borderRadius: "10px",
        background: "var(--accent-light)", color: "var(--accent-text)",
        border: "1px solid var(--accent-light)", whiteSpace: "nowrap",
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
