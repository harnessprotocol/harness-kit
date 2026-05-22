import type { TrustTier } from '@/lib/marketplace/types';

interface TrustMeta {
  label: string;
  color: string;
  icon: 'check' | 'alert' | 'x' | 'dash';
}

const TRUST: Record<TrustTier, TrustMeta> = {
  verified: { label: 'Verified', color: 'var(--cat-green)', icon: 'check' },
  caution: { label: 'Caution', color: '#f59e0b', icon: 'alert' },
  warning: { label: 'Review', color: '#ef4444', icon: 'x' },
  unscanned: { label: 'Unscanned', color: 'var(--fg-subtle)', icon: 'dash' },
};

function Glyph({ icon, color }: { icon: TrustMeta['icon']; color: string }) {
  const common = {
    width: 12,
    height: 12,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: color,
    strokeWidth: 2.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  switch (icon) {
    case 'check':
      return (
        <svg {...common}>
          <path d="M20 6 9 17l-5-5" />
        </svg>
      );
    case 'alert':
      return (
        <svg {...common}>
          <path d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        </svg>
      );
    case 'x':
      return (
        <svg {...common}>
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <path d="M5 12h14" />
        </svg>
      );
  }
}

export function TrustBadge({ tier, title }: { tier: TrustTier; title?: string }) {
  const meta = TRUST[tier];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{
        color: meta.color,
        background: `color-mix(in srgb, ${meta.color} 12%, transparent)`,
        border: `1px solid color-mix(in srgb, ${meta.color} 35%, transparent)`,
      }}
      title={title ?? `Security scan: ${meta.label}`}
    >
      <Glyph icon={meta.icon} color={meta.color} />
      {meta.label}
    </span>
  );
}
