import type { Metadata } from 'next';
import { SiteNav } from '@/components/site/SiteNav';
import { SiteFooter } from '@/components/site/SiteFooter';
import { HeroGlow } from '@/components/site/HeroGlow';
import { MarketplaceBrowser } from '@/components/marketplace/MarketplaceBrowser';
import { getAllPlugins, getAllTags, getCategories } from '@/lib/marketplace/data';

export const metadata: Metadata = {
  title: 'Marketplace — Harness Kit',
  description: 'Browse and install harness-kit plugins by name. Every plugin is security-scanned at build time.',
};

export default function MarketplacePage() {
  const plugins = getAllPlugins();
  const categories = getCategories();
  const tags = getAllTags();

  return (
    <main className="min-h-screen">
      <SiteNav />

      <section className="relative overflow-hidden">
        <HeroGlow />
        <div className="relative mx-auto max-w-4xl px-6 pb-10 pt-20 text-center">
          <h1 className="font-display mb-4 text-4xl font-bold tracking-tight text-fd-foreground sm:text-5xl">
            Plugin Marketplace
          </h1>
          <p className="mx-auto max-w-xl text-base leading-relaxed text-fd-muted-foreground">
            {plugins.length} plugins, installable by name. Each one is security-scanned at build time —
            no clone, no path juggling.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-24">
        <MarketplaceBrowser plugins={plugins} categories={categories} tags={tags} />
      </section>

      <SiteFooter />
    </main>
  );
}
