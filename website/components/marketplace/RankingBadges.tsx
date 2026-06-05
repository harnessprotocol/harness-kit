import type { TrustTier } from '@/lib/marketplace/types';
import { TrustBadge } from './TrustBadge';

interface RankingBadgesProps {
  sourceId: string;
  trust: TrustTier;
  stars?: number;
  installs?: number;
  /** Whether to show the security TrustBadge inline. Default true. */
  showTrust?: boolean;
}

/**
 * Composes provenance (official/first-party) + security trust + optional metrics
 * into a single inline row. Used on plugin/profile cards and detail page headers.
 */
export function RankingBadges({
  sourceId,
  trust,
  stars,
  installs,
  showTrust = true,
}: RankingBadgesProps) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {sourceId === 'first-party' && (
        <span
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
          style={{
            color: 'var(--accent)',
            background: 'var(--accent-light)',
          }}
          title="First-party plugin — maintained by harnessprotocol"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
          Official
        </span>
      )}

      {showTrust && <TrustBadge tier={trust} />}

      {typeof stars === 'number' && (
        <span
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] text-fd-muted-foreground"
          style={{ background: 'var(--bg-surface)' }}
          title={`${stars.toLocaleString()} GitHub stars`}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
          {stars >= 1000 ? `${(stars / 1000).toFixed(1)}k` : stars}
        </span>
      )}

      {typeof installs === 'number' && (
        <span
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] text-fd-muted-foreground"
          style={{ background: 'var(--bg-surface)' }}
          title={`${installs.toLocaleString()} installs`}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 2v13M5 9l7 7 7-7" />
            <path d="M5 20h14" />
          </svg>
          {installs >= 1000 ? `${(installs / 1000).toFixed(1)}k` : installs}
        </span>
      )}
    </div>
  );
}
