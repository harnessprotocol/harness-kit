import { useState } from 'react';
import type { RoadmapFeature } from '../../lib/roadmap-types';
import {
  ROADMAP_PRIORITY_CONFIG,
  ROADMAP_COMPLEXITY_CONFIG,
  ROADMAP_IMPACT_CONFIG,
} from '../../lib/roadmap-constants';

interface Props {
  feature: RoadmapFeature;
  onSelect: (f: RoadmapFeature) => void;
  isDragging?: boolean;
}

export function FeatureCard({ feature, onSelect, isDragging }: Props) {
  const [hovered, setHovered] = useState(false);
  const priorityCfg = ROADMAP_PRIORITY_CONFIG[feature.priority];
  const complexityCfg = ROADMAP_COMPLEXITY_CONFIG[feature.complexity];
  const impactCfg = ROADMAP_IMPACT_CONFIG[feature.impact];
  const hasInsights = (feature.competitorInsightIds?.length ?? 0) > 0;

  return (
    <div
      onClick={() => onSelect(feature)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: isDragging ? 'var(--bg-hover)' : hovered ? 'var(--bg-hover)' : 'var(--bg-elevated)',
        border: `1px solid ${hovered && !isDragging ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: 8,
        padding: 10,
        cursor: 'pointer',
        transition: 'border-color 0.1s, background 0.1s',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        opacity: isDragging ? 0.85 : 1,
      }}
    >
      {/* Title */}
      <span style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.4, color: 'var(--text-primary)' }}>
        {feature.title}
      </span>

      {/* Description — 2-line clamp */}
      {feature.description && (
        <p
          style={{
            margin: 0,
            fontSize: 11,
            lineHeight: 1.6,
            color: 'var(--text-secondary)',
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
          }}
        >
          {feature.description}
        </p>
      )}

      {/* Badges row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 5 }}>
        {/* Priority badge */}
        <span
          style={{
            borderRadius: 9999,
            border: `1px solid ${priorityCfg.border}`,
            background: priorityCfg.bg,
            color: priorityCfg.color,
            padding: '1px 6px',
            fontSize: 10,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          {priorityCfg.label}
        </span>

        {/* Complexity badge */}
        <span
          style={{
            borderRadius: 9999,
            border: '1px solid var(--border-subtle)',
            background: 'var(--bg-surface)',
            padding: '1px 6px',
            fontSize: 10,
            fontWeight: 500,
            color: complexityCfg.color,
          }}
        >
          {complexityCfg.label}
        </span>

        {/* Impact badge */}
        <span
          style={{
            borderRadius: 9999,
            border: '1px solid var(--border-subtle)',
            background: 'var(--bg-surface)',
            padding: '1px 6px',
            fontSize: 10,
            fontWeight: 500,
            color: impactCfg.color,
          }}
        >
          {impactCfg.label} impact
        </span>

        {/* Phase badge */}
        {feature.phaseId && (
          <span
            style={{
              borderRadius: 9999,
              border: '1px solid var(--border-subtle)',
              background: 'var(--bg-surface)',
              padding: '1px 6px',
              fontSize: 10,
              color: 'var(--text-muted)',
            }}
          >
            {feature.phaseId}
          </span>
        )}

        {/* Competitor insight indicator */}
        {hasInsights && (
          <span
            style={{
              borderRadius: 9999,
              border: '1px solid rgba(37,99,235,0.3)',
              background: 'rgba(37,99,235,0.08)',
              color: '#2563eb',
              padding: '1px 6px',
              fontSize: 10,
              fontWeight: 500,
            }}
            title="Has competitor insights"
          >
            {'↗'} Insight
          </span>
        )}

        {/* Linked task badge */}
        {feature.linkedTaskId != null && (
          <span
            style={{
              borderRadius: 9999,
              border: '1px solid rgba(22,163,74,0.3)',
              background: 'rgba(22,163,74,0.08)',
              color: '#16a34a',
              padding: '1px 6px',
              fontSize: 10,
              fontWeight: 500,
            }}
          >
            #{feature.linkedTaskId}
          </span>
        )}
      </div>
    </div>
  );
}
