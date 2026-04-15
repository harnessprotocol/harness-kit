export function ThinkingRow() {
  return (
    <div
      style={{
        padding: '6px 0 6px 16px',
        borderLeft: '2px solid var(--border)',
        fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
        fontSize: 13,
        color: 'var(--fg-subtle)',
        display: 'flex',
        alignItems: 'center',
        gap: 4,
      }}
    >
      <span>·</span>
      <span className="thinking-dots" />
    </div>
  );
}
