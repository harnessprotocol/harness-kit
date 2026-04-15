interface Props {
  content: string;
}

export function ErrorRow({ content }: Props) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        padding: '4px 0',
        fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
        fontSize: 12,
        color: 'var(--danger, #dc2626)',
        alignItems: 'flex-start',
      }}
    >
      <span style={{ flexShrink: 0, userSelect: 'none', fontWeight: 700 }}>!</span>
      <span style={{ wordBreak: 'break-word' }}>{content}</span>
    </div>
  );
}
