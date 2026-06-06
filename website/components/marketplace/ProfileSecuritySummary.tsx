import type { ProfileSecurity } from '@/lib/marketplace/types';

/**
 * An honest, count-based security summary for a curated bundle. Unlike a single
 * worst-case trust badge — which lets one flagged plugin stamp the whole profile as
 * risky — this shows how many of the bundled plugins are clean vs. need review.
 */
export function ProfileSecuritySummary({
  security,
  verbose = false,
}: {
  security: ProfileSecurity;
  verbose?: boolean;
}) {
  const flagged = security.cautionCount + security.warningCount;
  const unscanned = security.unscannedCount;

  if (flagged === 0 && unscanned === 0) {
    return (
      <span
        className="inline-flex items-center gap-1 font-medium"
        style={{ color: 'var(--cat-green)' }}
        title={`All ${security.pluginCount} plugins passed the security scan`}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 6 9 17l-5-5" />
        </svg>
        {verbose ? `All ${security.pluginCount} plugins scanned & clean` : 'All scanned'}
      </span>
    );
  }

  if (flagged > 0) {
    return (
      <span
        className="inline-flex items-center gap-1 font-medium"
        style={{ color: '#f59e0b' }}
        title={`${flagged} of ${security.pluginCount} plugins have scan findings to review`}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        {security.verifiedCount}/{security.pluginCount} verified
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 font-medium text-fd-muted-foreground" title={`${unscanned} plugins not yet scanned`}>
      {security.verifiedCount}/{security.pluginCount} scanned
    </span>
  );
}
