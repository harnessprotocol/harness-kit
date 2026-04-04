import { useState } from 'react';

interface Props {
  onGenerate: () => void;
}

export function RoadmapEmptyState({ onGenerate }: Props) {
  const [loading, setLoading] = useState(false);

  const handleClick = () => {
    setLoading(true);
    onGenerate();
  };

  return (
    <div
      style={{
        display: 'flex',
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
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
            color: 'var(--text-muted)',
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
            <line x1="9" y1="3" x2="9" y2="18" />
            <line x1="15" y1="6" x2="15" y2="21" />
          </svg>
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
          onClick={handleClick}
          disabled={loading}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 20px',
            background: loading ? 'var(--bg-surface)' : 'var(--accent)',
            color: loading ? 'var(--text-muted)' : '#fff',
            border: loading ? '1px solid var(--border-subtle)' : 'none',
            borderRadius: 7,
            fontSize: 13,
            fontWeight: 600,
            cursor: loading ? 'default' : 'pointer',
            transition: 'opacity 0.1s, background 0.15s, color 0.15s',
          }}
          onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLElement).style.opacity = '0.85'; }}
          onMouseLeave={e => { if (!loading) (e.currentTarget as HTMLElement).style.opacity = '1'; }}
        >
          {loading ? (
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              style={{ animation: 'spin 0.8s linear infinite' }}
            >
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
          ) : (
            <span style={{ fontSize: 14 }}>✦</span>
          )}
          {loading ? 'Starting...' : 'Generate Roadmap'}
        </button>
      </div>
    </div>
  );
}
