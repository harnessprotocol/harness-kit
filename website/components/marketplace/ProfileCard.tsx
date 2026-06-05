import Link from 'next/link';
import type { MarketplaceProfile } from '@/lib/marketplace/types';
import { TrustBadge } from './TrustBadge';
import { categoryAccent } from '@/lib/marketplace/category';

export function ProfileCard({ profile }: { profile: MarketplaceProfile }) {
  return (
    <Link
      href={`/marketplace/profiles/${profile.slug}`}
      className="group flex cursor-pointer flex-col rounded-xl bg-fd-card/50 p-5 no-underline backdrop-blur-sm transition-all duration-300 hover:bg-fd-card/80 hover:shadow-lg"
      style={{ borderTop: '2px solid var(--accent)' }}
    >
      {/* Header row */}
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <span
          className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
          style={{ color: 'var(--accent)', background: 'var(--accent-light)' }}
        >
          Profile
        </span>
        <TrustBadge tier={profile.aggregateTrust} title={`Aggregate security trust: ${profile.aggregateTrust}`} />
      </div>

      {/* Name */}
      <h3 className="font-display mb-1 font-semibold text-fd-foreground">{profile.persona}</h3>

      {/* Description */}
      <p className="mb-3 line-clamp-3 flex-1 text-sm leading-relaxed text-fd-muted-foreground">
        {profile.description}
      </p>

      {/* Footer: plugin category dots + count */}
      <div className="flex items-center gap-2">
        {/* Mini category colour dots for bundled plugins */}
        <div className="flex items-center -space-x-0.5">
          {[...new Set(profile.plugins.filter((r) => r.resolved && r.category).map((r) => r.category!))]
            .slice(0, 5)
            .map((cat) => (
              <span
                key={cat}
                className="size-2.5 rounded-full ring-1 ring-fd-card/80"
                style={{ background: categoryAccent(cat) }}
                title={cat}
              />
            ))}
        </div>
        <span className="text-[11px] text-fd-muted-foreground">
          {profile.plugins.filter((r) => r.resolved).length} plugin
          {profile.plugins.filter((r) => r.resolved).length === 1 ? '' : 's'}
        </span>
        {profile.stars !== undefined && (
          <>
            <span className="text-fd-muted-foreground/40">·</span>
            <span className="inline-flex items-center gap-0.5 text-[11px] text-fd-muted-foreground">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
              {profile.stars}
            </span>
          </>
        )}
      </div>
    </Link>
  );
}
