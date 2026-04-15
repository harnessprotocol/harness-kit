interface Props {
  content: string;
}

export function UserPromptRow({ content }: Props) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        padding: '6px 0',
        fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
        fontSize: 13,
        lineHeight: 1.6,
        alignItems: 'flex-start',
      }}
    >
      <span style={{ color: 'var(--accent)', flexShrink: 0, userSelect: 'none', marginTop: 1 }}>
        &gt;
      </span>
      <span style={{ color: 'var(--fg-base)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', flex: 1 }}>
        {content}
      </span>
    </div>
  );
}
