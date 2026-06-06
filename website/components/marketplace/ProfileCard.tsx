import Link from 'next/link';
import type { MarketplaceProfile } from '@/lib/marketplace/types';
import { categoryAccent } from '@/lib/marketplace/category';
import { ProfileSecuritySummary } from './ProfileSecuritySummary';

export function ProfileCard({ profile }: { profile: MarketplaceProfile }) {
  const resolved = profile.plugins.filter((r) => r.resolved);
  const shown = resolved.slice(0, 4);
  const extra = resolved.length - shown.length;

  return (
    <Link
      href={`/marketplace/profiles/${profile.slug}`}
      className="group surface-card flex cursor-pointer flex-col rounded-xl p-5 no-underline"
      style={{ borderTop: '2px solid var(--accent)' }}
    >
      {/* Header: persona identity */}
      <div className="mb-3 flex items-center gap-3">
        <div
          className="flex size-10 shrink-0 items-center justify-center rounded-lg"
          style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polygon points="12 2 2 7 12 12 22 7 12 2" />
            <polyline points="2 17 12 22 22 17" />
            <polyline points="2 12 12 17 22 12" />
          </svg>
        </div>
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--accent)' }}>
            Profile
          </div>
          <h3 className="font-display font-semibold leading-tight text-fd-foreground">{profile.persona}</h3>
        </div>
      </div>

      {/* Description */}
      <p className="mb-4 line-clamp-2 text-sm leading-relaxed text-fd-muted-foreground">
        {profile.description}
      </p>

      {/* What's inside — plugin preview chips */}
      <div className="mb-4 flex flex-1 flex-wrap content-start gap-1.5">
        {shown.map((ref) => (
          <span
            key={ref.name}
            className="inline-flex items-center gap-1.5 rounded-full bg-fd-card/70 px-2 py-0.5 font-mono text-[11px] text-fd-muted-foreground"
          >
            <span className="size-1.5 rounded-full" style={{ background: categoryAccent(ref.category ?? '') }} />
            {ref.name}
          </span>
        ))}
        {extra > 0 && (
          <span className="inline-flex items-center rounded-full bg-fd-card/70 px-2 py-0.5 text-[11px] text-fd-muted-foreground">
            +{extra} more
          </span>
        )}
      </div>

      {/* Footer: count + honest security summary */}
      <div className="flex items-center justify-between text-[11px] text-fd-muted-foreground">
        <span>
          {resolved.length} plugin{resolved.length === 1 ? '' : 's'}
        </span>
        <ProfileSecuritySummary security={profile.security} />
      </div>
    </Link>
  );
}
