interface Props {
  toolName: string;
  ok: boolean;
  content: unknown;
}

export function ToolResultRow({ toolName, ok, content }: Props) {
  const summary = (() => {
    if (!ok) {
      const err = (content as { error?: string })?.error ?? String(content);
      return `error: ${err}`;
    }
    if (typeof content === 'object' && content !== null) {
      const keys = Object.keys(content);
      return `{${keys.slice(0, 4).join(', ')}${keys.length > 4 ? ', …' : ''}}`;
    }
    return String(content).slice(0, 100);
  })();

  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        padding: '4px 0',
        fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
        fontSize: 11,
        color: ok ? 'var(--success, #16a34a)' : 'var(--danger, #dc2626)',
        alignItems: 'flex-start',
      }}
    >
      <span style={{ flexShrink: 0, userSelect: 'none' }}>«</span>
      <div>
        <span style={{ fontWeight: 700 }}>{toolName}</span>
        <span style={{ marginLeft: 4, color: ok ? 'var(--fg-subtle)' : 'inherit' }}>
          {summary}
        </span>
      </div>
    </div>
  );
}
