import Link from 'next/link';
import type { MarketplaceProfile } from '@/lib/marketplace/types';
import { TrustBadge } from './TrustBadge';
import { RankingBadges } from './RankingBadges';
import { ProfileSecuritySummary } from './ProfileSecuritySummary';
import { InstallWidget } from './InstallWidget';
import { categoryAccent } from '@/lib/marketplace/category';

function PluginRefRow({ name, slug, category, trust, liveVersion }: {
  name: string;
  slug?: string;
  category?: string;
  trust?: MarketplaceProfile['plugins'][0]['trust'];
  liveVersion?: string;
}) {
  const accent = category ? categoryAccent(category) : 'var(--fg-subtle)';
  const inner = (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="flex items-center gap-2.5 min-w-0">
        {category && (
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ background: accent }}
          />
        )}
        <span className="font-mono text-sm text-fd-foreground truncate">{name}</span>
        {liveVersion && (
          <span className="font-mono text-[11px] text-fd-muted-foreground shrink-0">v{liveVersion}</span>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {trust && <TrustBadge tier={trust} />}
        {slug && (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-fd-muted-foreground/50" aria-hidden="true">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        )}
      </div>
    </div>
  );

  if (slug) {
    return (
      <Link
        href={`/marketplace/${slug}`}
        className="block no-underline transition-colors hover:bg-fd-card/80"
      >
        {inner}
      </Link>
    );
  }
  return <div className="opacity-50">{inner}</div>;
}

export function ProfileDetail({ profile }: { profile: MarketplaceProfile }) {
  return (
    <article className="mx-auto max-w-3xl px-6 pb-24 pt-12">
      <Link href="/marketplace" className="text-sm text-fd-muted-foreground no-underline hover:text-fd-foreground">
        ← Marketplace
      </Link>

      {/* Header */}
      <header className="mb-8 mt-4">
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {/* Provenance only — security is shown as a count-based summary, not a
              worst-case badge that one flagged plugin could dominate. */}
          <RankingBadges sourceId={profile.sourceId} trust={profile.aggregateTrust} showTrust={false} />
          <ProfileSecuritySummary security={profile.security} verbose />
        </div>
        <div className="mb-1 flex items-center gap-2.5">
          <span
            className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
            style={{ color: 'var(--accent)', background: 'var(--accent-light)' }}
          >
            Harness Profile
          </span>
        </div>
        <h1 className="font-display mb-2 text-3xl font-bold tracking-tight text-fd-foreground">
          {profile.persona}
        </h1>
        <p className="text-base leading-relaxed text-fd-muted-foreground">{profile.description}</p>
        <div className="mt-3 text-xs text-fd-muted-foreground">
          By {profile.author} · {profile.plugins.filter((r) => r.resolved).length} plugins bundled
        </div>
      </header>

      {/* Install */}
      <section className="mb-10">
        <h2 className="font-display mb-3 text-lg font-semibold text-fd-foreground">Install</h2>
        <InstallWidget kind="profile" profile={profile} />
      </section>

      {/* What's inside */}
      <section className="mb-10">
        <h2 className="font-display mb-3 text-lg font-semibold text-fd-foreground">
          What&apos;s inside
        </h2>
        <div className="flex flex-col divide-y divide-fd-border overflow-hidden rounded-xl bg-fd-card/50">
          {profile.plugins.map((ref) => (
            <PluginRefRow
              key={ref.name}
              name={ref.name}
              slug={ref.resolved ? ref.slug : undefined}
              category={ref.category}
              trust={ref.trust}
              liveVersion={ref.liveVersion ?? ref.version}
            />
          ))}
        </div>
        <p className="mt-2 text-xs text-fd-muted-foreground">
          Click any plugin to view its full documentation and security scan.
        </p>
      </section>

      {/* Rules */}
      {profile.rules.length > 0 && (
        <section className="mb-10">
          <h2 className="font-display mb-3 text-lg font-semibold text-fd-foreground">
            Workflow rules
          </h2>
          <ul className="flex flex-col gap-2">
            {profile.rules.map((rule, i) => (
              <li
                key={i}
                className="flex items-start gap-2.5 rounded-lg bg-fd-card/40 px-4 py-2.5 text-sm leading-relaxed text-fd-muted-foreground"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0" aria-hidden="true">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                {rule}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Knowledge */}
      {profile.knowledge && (
        <section className="mb-10">
          <h2 className="font-display mb-3 text-lg font-semibold text-fd-foreground">
            Knowledge seeding
          </h2>
          <div className="rounded-xl bg-fd-card/50 p-4">
            <p className="mb-3 text-sm text-fd-muted-foreground">
              Memory backend:{' '}
              <code className="font-mono text-xs text-fd-foreground">{profile.knowledge.backend}</code>
            </p>
            {profile.knowledge.seedDocs.length > 0 && (
              <div className="flex flex-col gap-1.5">
                {profile.knowledge.seedDocs.map((doc) => (
                  <div key={doc.topic} className="flex items-start gap-2 text-sm">
                    <code className="font-mono text-xs text-fd-foreground shrink-0 mt-0.5">{doc.topic}</code>
                    <span className="text-fd-muted-foreground">— {doc.description}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Raw harness.yaml */}
      <section>
        <details className="group rounded-xl bg-fd-card/40 px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium text-fd-muted-foreground transition-colors hover:text-fd-foreground select-none">
            View harness.yaml
          </summary>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-fd-card p-4 font-mono text-[12px] leading-relaxed text-fd-foreground">
            {profile.harnessYaml}
          </pre>
        </details>
      </section>
    </article>
  );
}
