import { useEffect, useRef, useState } from 'react';
import { streamRoadmapGeneration, type GenerationPhase } from '../../lib/roadmap-api';

interface Props {
  projectSlug: string;
  onComplete: () => void;
  onCancel: () => void;
}

const PHASES: { id: GenerationPhase | 'idle'; label: string }[] = [
  { id: 'analyzing', label: 'Analyzing project' },
  { id: 'generating', label: 'Generating roadmap' },
  { id: 'saving', label: 'Saving' },
];

function PhaseRow({ id, label, activePhase, error }: {
  id: GenerationPhase;
  label: string;
  activePhase: GenerationPhase | 'idle' | 'done';
  error: string | null;
}) {
  const idx = PHASES.findIndex(p => p.id === id);
  const activeIdx = PHASES.findIndex(p => p.id === activePhase);
  const isDone = activePhase === 'done' || activeIdx > idx;
  const isActive = activePhase === id;
  const isFailed = isActive && error !== null;
  const isPending = !isDone && !isActive;

  const color = isFailed ? '#ef4444'
    : isDone ? 'var(--accent)'
    : isActive ? 'var(--text-primary)'
    : 'var(--text-muted)';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '6px 0',
        opacity: isPending ? 0.4 : 1,
        transition: 'opacity 0.3s',
      }}
    >
      {/* Status indicator */}
      <div
        style={{
          width: 20,
          height: 20,
          borderRadius: '50%',
          background: isFailed ? 'rgba(239,68,68,0.15)'
            : isDone ? 'rgba(var(--accent-rgb, 99,102,241), 0.15)'
            : isActive ? 'var(--bg-surface)'
            : 'transparent',
          border: `1.5px solid ${color}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          transition: 'all 0.3s',
        }}
      >
        {isDone && !isFailed && (
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
            <polyline points="2 6 5 9 10 3" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        {isFailed && (
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
            <line x1="3" y1="3" x2="9" y2="9" stroke={color} strokeWidth="2" strokeLinecap="round" />
            <line x1="9" y1="3" x2="3" y2="9" stroke={color} strokeWidth="2" strokeLinecap="round" />
          </svg>
        )}
        {isActive && !isFailed && (
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: 'var(--accent)',
              animation: 'pulse 1.2s ease-in-out infinite',
            }}
          />
        )}
      </div>

      <span style={{ fontSize: 13, color, transition: 'color 0.3s' }}>
        {label}
        {isActive && !isFailed && (
          <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>...</span>
        )}
      </span>
    </div>
  );
}

export function RoadmapGenerationView({ projectSlug, onComplete, onCancel }: Props) {
  const [phase, setPhase] = useState<GenerationPhase | 'idle' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const cancelRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (started) return;
    setStarted(true);

    const cancel = streamRoadmapGeneration(projectSlug, (event) => {
      if (event.type === 'phase' && event.phase) {
        setPhase(event.phase);
        setError(null);
      } else if (event.type === 'done') {
        setPhase('done');
        setTimeout(onComplete, 600);
      } else if (event.type === 'error') {
        setError(event.message ?? 'Unknown error');
      }
    });

    cancelRef.current = cancel;
    return () => cancel();
  }, [projectSlug, started, onComplete]);

  const handleCancel = () => {
    cancelRef.current?.();
    onCancel();
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
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.8); }
        }
      `}</style>

      <div
        style={{
          width: '100%',
          maxWidth: 400,
          padding: 32,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 12,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent)',
              flexShrink: 0,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
              <line x1="9" y1="3" x2="9" y2="18" />
              <line x1="15" y1="6" x2="15" y2="21" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
              Generating Roadmap
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>
              Claude is analyzing your project
            </div>
          </div>
        </div>

        {/* Phase list */}
        <div style={{ marginBottom: 20 }}>
          {PHASES.map(p => (
            <PhaseRow
              key={p.id}
              id={p.id as GenerationPhase}
              label={p.label}
              activePhase={phase}
              error={error}
            />
          ))}
        </div>

        {/* Error state */}
        {error && (
          <div
            style={{
              padding: '10px 12px',
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.2)',
              borderRadius: 7,
              fontSize: 12,
              color: '#ef4444',
              lineHeight: 1.5,
              marginBottom: 12,
            }}
          >
            {error}
          </div>
        )}

        {/* Cancel button — only while in progress */}
        {phase !== 'done' && (
          <button
            onClick={handleCancel}
            style={{
              width: '100%',
              padding: '7px',
              background: 'transparent',
              border: '1px solid var(--border-subtle)',
              borderRadius: 7,
              fontSize: 12,
              color: 'var(--text-muted)',
              cursor: 'pointer',
              transition: 'color 0.15s, border-color 0.15s',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)';
              (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-default)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)';
              (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-subtle)';
            }}
          >
            {error ? 'Dismiss' : 'Cancel'}
          </button>
        )}
      </div>
    </div>
  );
}
