import { useState } from 'react';
import type { RoadmapPhase, RoadmapFeature } from '../../lib/roadmap-types';
import { ROADMAP_PRIORITY_CONFIG } from '../../lib/roadmap-constants';

interface Props {
  phase: RoadmapPhase;
  features: RoadmapFeature[];
  onFeatureSelect: (f: RoadmapFeature) => void;
  onBuild: (f: RoadmapFeature) => void;
}

const INITIAL_VISIBLE = 5;

const PHASE_STATUS_CONFIG: Record<string, { color: string; bg: string; border: string }> = {
  completed:   { color: '#16a34a', bg: 'rgba(22,163,74,0.1)',   border: 'rgba(22,163,74,0.2)' },
  in_progress: { color: '#2563eb', bg: 'rgba(37,99,235,0.1)',   border: 'rgba(37,99,235,0.2)' },
  planned:     { color: '#9a9892', bg: 'rgba(154,152,146,0.1)', border: 'rgba(154,152,146,0.2)' },
};

export function PhaseCard({ phase, features, onFeatureSelect, onBuild }: Props) {
  const [expanded, setExpanded] = useState(false);

  const completedCount = features.filter(f => f.status === 'done').length;
  const totalCount = features.length;
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
  const visibleFeatures = expanded ? features : features.slice(0, INITIAL_VISIBLE);
  const hiddenCount = totalCount - INITIAL_VISIBLE;

  const statusCfg = PHASE_STATUS_CONFIG[phase.status] ?? PHASE_STATUS_CONFIG['planned'];

  return (
    <div
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 10,
        padding: 16,
      }}
    >
      {/* Phase header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Phase number / check badge */}
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              background: statusCfg.bg,
              border: `1px solid ${statusCfg.border}`,
              fontSize: 13,
              fontWeight: 700,
              color: statusCfg.color,
            }}
          >
            {phase.status === 'completed' ? '✓' : phase.order}
          </div>

          <div>
            <h3 style={{ margin: '0 0 2px', fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
              {phase.name}
            </h3>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 }}>
              {phase.description}
            </p>
          </div>
        </div>

        {/* Status badge */}
        <span
          style={{
            borderRadius: 9999,
            border: `1px solid ${statusCfg.border}`,
            background: statusCfg.bg,
            color: statusCfg.color,
            padding: '1px 8px',
            fontSize: 10,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            flexShrink: 0,
          }}
        >
          {phase.status.replace('_', ' ')}
        </span>
      </div>

      {/* Progress bar */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Progress</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {completedCount}/{totalCount} features
          </span>
        </div>
        <div
          style={{
            height: 5,
            background: 'var(--bg-surface)',
            borderRadius: 3,
            overflow: 'hidden',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${progress}%`,
              background: 'var(--accent)',
              borderRadius: 3,
              transition: 'width 0.3s ease',
            }}
          />
        </div>
      </div>

      {/* Milestones */}
      {phase.milestones.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <h4 style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Milestones
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {phase.milestones.map(milestone => (
              <div
                key={milestone.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  fontSize: 12,
                  color: milestone.status === 'achieved' ? 'var(--text-muted)' : 'var(--text-secondary)',
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    flexShrink: 0,
                    color: milestone.status === 'achieved' ? '#16a34a' : 'var(--text-muted)',
                  }}
                >
                  {milestone.status === 'achieved' ? '✓' : '○'}
                </span>
                <span
                  style={{
                    textDecoration: milestone.status === 'achieved' ? 'line-through' : 'none',
                    lineHeight: 1.4,
                  }}
                >
                  {milestone.title}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Features list */}
      <div>
        <h4 style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Features ({totalCount})
        </h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {visibleFeatures.map(feature => {
            const priorityCfg = ROADMAP_PRIORITY_CONFIG[feature.priority];
            const hasInsights = (feature.competitorInsightIds?.length ?? 0) > 0;
            return (
              <div
                key={feature.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '6px 8px',
                  borderRadius: 6,
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  gap: 8,
                }}
              >
                {/* Clickable left side */}
                <button
                  onClick={() => onFeatureSelect(feature)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    flex: 1,
                    minWidth: 0,
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span
                    style={{
                      borderRadius: 9999,
                      border: `1px solid ${priorityCfg.border}`,
                      background: priorityCfg.bg,
                      color: priorityCfg.color,
                      padding: '0px 5px',
                      fontSize: 9,
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      flexShrink: 0,
                    }}
                  >
                    {priorityCfg.label}
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      color: 'var(--text-primary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {feature.title}
                  </span>
                  {hasInsights && (
                    <span style={{ fontSize: 11, color: '#2563eb', flexShrink: 0 }} title="Competitor insights">↗</span>
                  )}
                </button>

                {/* Right side: task badge or build button */}
                {feature.linkedTaskId != null ? (
                  <span
                    style={{
                      borderRadius: 9999,
                      border: '1px solid rgba(22,163,74,0.3)',
                      background: 'rgba(22,163,74,0.08)',
                      color: '#16a34a',
                      padding: '1px 6px',
                      fontSize: 10,
                      fontWeight: 500,
                      flexShrink: 0,
                    }}
                  >
                    #{feature.linkedTaskId}
                  </span>
                ) : (
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      onBuild(feature);
                    }}
                    style={{
                      padding: '2px 8px',
                      background: 'transparent',
                      border: '1px solid var(--border)',
                      borderRadius: 4,
                      fontSize: 10,
                      fontWeight: 500,
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      flexShrink: 0,
                      transition: 'border-color 0.1s, color 0.1s',
                    }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)';
                      (e.currentTarget as HTMLElement).style.color = 'var(--accent)';
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
                      (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)';
                    }}
                  >
                    Build
                  </button>
                )}
              </div>
            );
          })}

          {/* Show more / less toggle */}
          {hiddenCount > 0 && (
            <button
              onClick={() => setExpanded(prev => !prev)}
              style={{
                width: '100%',
                padding: '6px',
                background: 'transparent',
                border: 'none',
                borderRadius: 5,
                fontSize: 12,
                color: 'var(--text-muted)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                transition: 'color 0.1s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; }}
            >
              {expanded ? '↑ Show less' : `↓ Show ${hiddenCount} more`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
