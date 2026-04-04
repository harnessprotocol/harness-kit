interface Props {
  onGenerate: () => void;
}

export function RoadmapEmptyState({ onGenerate }: Props) {
  return (
    <div
      style={{
        display: 'flex',
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 480,
          padding: 32,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 12,
          textAlign: 'center',
        }}
      >
        {/* Icon */}
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: '50%',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
            fontSize: 24,
          }}
        >
          {'🗺'}
        </div>

        <h2
          style={{
            margin: '0 0 8px',
            fontSize: 18,
            fontWeight: 600,
            color: 'var(--text-primary)',
          }}
        >
          No Roadmap Yet
        </h2>

        <p
          style={{
            margin: '0 0 24px',
            fontSize: 13,
            lineHeight: 1.6,
            color: 'var(--text-secondary)',
          }}
        >
          Generate an AI-powered roadmap that understands your project's target audience and creates
          a strategic feature plan.
        </p>

        <button
          onClick={onGenerate}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 20px',
            background: 'var(--accent)',
            color: '#fff',
            border: 'none',
            borderRadius: 7,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'opacity 0.1s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '0.85'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
        >
          <span style={{ fontSize: 14 }}>{'✦'}</span>
          Generate Roadmap
        </button>
      </div>
    </div>
  );
}
