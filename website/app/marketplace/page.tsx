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

export default function MarketplacePage() {
  const plugins = getAllPlugins();
  const profiles = getAllProfiles();
  const categories = getCategories();
  const tags = getAllTags();
  const stars = getRepoStars();

  return (
    <main className="min-h-screen">
      <SiteNav />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <HeroGlow />
        <div className="relative mx-auto max-w-4xl px-6 pb-8 pt-20 text-center">
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
          {typeof stars === 'number' && (
            <div className="mb-6 flex items-center justify-center gap-1.5 text-sm text-fd-muted-foreground">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
              {stars.toLocaleString()} stars on GitHub
            </div>
          )}
          <SupportedAgents />
        </div>
      </section>

      {/* Profiles — the standout feature, leads the page */}
      <section className="mx-auto max-w-5xl px-6 pb-16">
        <div className="mb-6">
          <h2 className="font-display mb-1.5 text-2xl font-bold tracking-tight text-fd-foreground">
            Harness Profiles
          </h2>
          <p className="text-sm text-fd-muted-foreground">
            Pre-configured plugin bundles for your role. Download a{' '}
            <code className="font-mono text-xs">harness.yaml</code> and you&apos;re set.
          </p>
        </div>

        {profiles.length === 0 ? (
          <p className="text-sm text-fd-muted-foreground">No profiles yet.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {profiles.map((profile) => (
              <ProfileCard key={profile.slug} profile={{ ...profile, stars }} />
            ))}
          </div>
        )}
      </section>

      {/* Divider */}
      <div className="mx-auto max-w-5xl px-6">
        <div
          className="mb-12 border-t"
          style={{ borderColor: 'color-mix(in srgb, var(--fg-subtle) 15%, transparent)' }}
        />
      </div>

      {/* Plugin browser */}
      <section className="mx-auto max-w-5xl px-6 pb-24">
        <div className="mb-6">
          <h2 className="font-display mb-1.5 text-2xl font-bold tracking-tight text-fd-foreground">
            Browse Plugins
          </h2>
          <p className="text-sm text-fd-muted-foreground">
            {plugins.length} plugins, each security-scanned at build time.
          </p>
        </div>
        <MarketplaceBrowser plugins={plugins} categories={categories} tags={tags} />
      </section>

      <SiteFooter />
    </main>
  );
}
