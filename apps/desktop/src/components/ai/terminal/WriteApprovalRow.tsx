interface Props {
  rowId: string;
  toolName: string;
  summary: string;
  onApprove: (rowId: string) => void;
  onDeny: (rowId: string) => void;
}

export function WriteApprovalRow({ rowId, toolName, summary, onApprove, onDeny }: Props) {
  const btnBase: React.CSSProperties = {
    border: 'none',
    borderRadius: 4,
    padding: '3px 10px',
    fontSize: 11,
    cursor: 'pointer',
    fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
  };

  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderLeft: '3px solid #f59e0b',
        borderRadius: 4,
        padding: '8px 12px',
        margin: '4px 0',
        background: 'var(--bg-surface)',
        fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
        fontSize: 12,
      }}
    >
      <div style={{ fontWeight: 700, color: '#f59e0b', marginBottom: 4 }}>
        ⚡ write: {toolName}
      </div>
      <div style={{ color: 'var(--fg-muted)', marginBottom: 10, lineHeight: 1.5 }}>
        {summary}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          style={{
            ...btnBase,
            background: 'var(--accent)',
            color: '#fff',
          }}
          onClick={() => onApprove(rowId)}
        >
          Approve
        </button>
        <button
          style={{
            ...btnBase,
            background: 'none',
            border: '1px solid var(--border)',
            color: 'var(--fg-muted)',
          }}
          onClick={() => onDeny(rowId)}
        >
          Deny
        </button>
      </div>
    </div>
  );
}
