import type { Metadata } from 'next';
import { SiteNav } from '@/components/site/SiteNav';
import { SiteFooter } from '@/components/site/SiteFooter';
import { HeroGlow } from '@/components/site/HeroGlow';
import { MarketplaceBrowser } from '@/components/marketplace/MarketplaceBrowser';
import { ProfileCard } from '@/components/marketplace/ProfileCard';
import { SupportedAgents } from '@/components/marketplace/SupportedAgents';
import { getAllPlugins, getAllProfiles, getAllTags, getCategories, getRepoStars } from '@/lib/marketplace/data';

export const metadata: Metadata = {
  title: 'Marketplace — Harness Kit',
  description: 'Curated harness profiles and security-scanned plugins for Claude Code, Cursor, Copilot, and more.',
};

// GitHub stars become credible social proof only past a threshold. Below it, a small
// count undercuts trust, so we lead with concrete catalog facts instead.
const STAR_DISPLAY_THRESHOLD = 50;

export default function MarketplacePage() {
  const plugins = getAllPlugins();
  const profiles = getAllProfiles();
  const categories = getCategories();
  const tags = getAllTags();
  const stars = getRepoStars();
  const showStars = typeof stars === 'number' && stars >= STAR_DISPLAY_THRESHOLD;

  return (
    <main className="min-h-screen">
      <SiteNav />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <HeroGlow />
        <div className="relative mx-auto max-w-4xl px-6 pb-10 pt-20 text-center">
          <div
            className="mb-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium"
            style={{ color: 'var(--accent)', background: 'var(--accent-light)' }}
          >
            Harness Protocol
          </div>
          <h1 className="font-display mb-4 text-4xl font-bold tracking-tight text-fd-foreground sm:text-5xl">
            Plugin Marketplace
          </h1>
          <p className="mx-auto mb-6 max-w-xl text-base leading-relaxed text-fd-muted-foreground">
            Curated profiles for how you work, and {plugins.length} security-scanned plugins — all
            installable by name. No clone, no path juggling.
          </p>

          {/* Concrete catalog facts — true social proof that doesn't depend on star count */}
          <div className="mb-6 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm text-fd-muted-foreground">
            <strong className="font-semibold text-fd-foreground">{profiles.length}</strong> curated profiles
            <span className="text-fd-muted-foreground/40">·</span>
            <strong className="font-semibold text-fd-foreground">{plugins.length}</strong> plugins
            <span className="text-fd-muted-foreground/40">·</span>
            <span className="inline-flex items-center gap-1" style={{ color: 'var(--cat-green)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 6 9 17l-5-5" />
              </svg>
              every plugin security-scanned
            </span>
            {showStars && (
              <>
                <span className="text-fd-muted-foreground/40">·</span>
                <a
                  href="https://github.com/harnessprotocol/harness-kit"
                  className="inline-flex items-center gap-1 no-underline hover:text-fd-foreground"
                  target="_blank"
                  rel="noreferrer"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                  {stars?.toLocaleString()}
                </a>
              </>
            )}
          </div>

          <SupportedAgents />
        </div>
      </section>

      {/* Profiles — the standout feature, in its own subtly accent-tinted band */}
      <section
        className="relative"
        style={{ background: 'color-mix(in srgb, var(--accent) 5%, var(--bg-base))' }}
        aria-labelledby="profiles-heading"
      >
        {/* Top hairline gradient marks the band */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{ background: 'linear-gradient(to right, transparent, color-mix(in srgb, var(--accent) 35%, transparent), transparent)' }}
          aria-hidden="true"
        />
        <div className="mx-auto max-w-5xl px-6 py-14">
          <div className="mb-7 max-w-2xl">
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.1em]" style={{ color: 'var(--accent)' }}>
              Start here
            </div>
            <h2 id="profiles-heading" className="font-display mb-2 text-2xl font-bold tracking-tight text-fd-foreground sm:text-3xl">
              Harness Profiles
            </h2>
            <p className="text-base leading-relaxed text-fd-muted-foreground">
              Role-based bundles that wire up the right plugins, rules, and knowledge in one shot.
              Pick yours, download a <code className="font-mono text-sm">harness.yaml</code>, and
              you&apos;re configured across every AI tool.
            </p>
          </div>

          {profiles.length === 0 ? (
            <p className="text-sm text-fd-muted-foreground">No profiles yet.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {profiles.map((profile) => (
                <ProfileCard key={profile.slug} profile={profile} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Plugin browser — the secondary path */}
      <section className="mx-auto max-w-5xl px-6 pb-24 pt-14">
        <div className="mb-6">
          <h2 className="font-display mb-1.5 text-2xl font-bold tracking-tight text-fd-foreground">
            Or browse all {plugins.length} plugins
          </h2>
          <p className="text-sm text-fd-muted-foreground">
            Every plugin is security-scanned at build time. Mix and match your own stack.
          </p>
        </div>
        <MarketplaceBrowser plugins={plugins} categories={categories} tags={tags} />
      </section>

      <SiteFooter />
    </main>
  );
}
