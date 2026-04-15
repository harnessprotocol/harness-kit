interface Props {
  toolName: string;
  args: unknown;
}

export function ToolCallRow({ toolName, args }: Props) {
  const argsStr = args ? JSON.stringify(args, null, 2) : '{}';
  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        padding: '4px 0',
        fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
        fontSize: 11,
        color: '#f59e0b', // amber — "outgoing" tool call
        alignItems: 'flex-start',
      }}
    >
      <span style={{ flexShrink: 0, userSelect: 'none' }}>»</span>
      <div>
        <span style={{ fontWeight: 700 }}>{toolName}</span>
        {argsStr !== '{}' && (
          <span style={{ color: 'var(--fg-subtle)', marginLeft: 4 }}>
            {argsStr.length > 120 ? argsStr.slice(0, 117) + '…' : argsStr}
          </span>
        )}
      </div>
    </div>
  );
}
