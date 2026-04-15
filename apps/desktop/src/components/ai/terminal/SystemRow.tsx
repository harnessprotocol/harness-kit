interface Props {
  content: string;
}

export function SystemRow({ content }: Props) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        padding: '4px 0',
        fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
        fontSize: 11,
        color: 'var(--fg-subtle)',
        alignItems: 'flex-start',
      }}
    >
      <span style={{ flexShrink: 0, userSelect: 'none' }}>#</span>
      <span>{content}</span>
    </div>
  );
}
