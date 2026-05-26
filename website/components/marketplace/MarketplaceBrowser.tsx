'use client';

import { useMemo, useState } from 'react';
import type { MarketplaceCategory, MarketplacePlugin, TrustTier } from '@/lib/marketplace/types';
import { PluginCard } from './PluginCard';

interface Props {
  plugins: MarketplacePlugin[];
  categories: MarketplaceCategory[];
  tags: string[];
}

const TRUST_FILTERS: { value: TrustTier | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'verified', label: 'Verified' },
  { value: 'caution', label: 'Caution' },
];

export function MarketplaceBrowser({ plugins, categories, tags }: Props) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>('all');
  const [trust, setTrust] = useState<TrustTier | 'all'>('all');
  const [tag, setTag] = useState<string>('all');

  const categoryNames = useMemo(
    () => new Map(categories.map((c) => [c.slug, c.name])),
    [categories],
  );

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return plugins.filter((p) => {
      if (category !== 'all' && p.category !== category) return false;
      if (trust !== 'all' && p.security.trust !== trust) return false;
      if (tag !== 'all' && !p.tags.includes(tag)) return false;
      if (q) {
        const haystack = `${p.name} ${p.description} ${p.tags.join(' ')}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [plugins, query, category, trust, tag]);

  const chip = (active: boolean) =>
    `cursor-pointer rounded-full px-3 py-1 text-sm transition-colors ${
      active
        ? 'bg-fd-primary/15 text-fd-foreground'
        : 'bg-fd-card/60 text-fd-muted-foreground hover:bg-fd-card hover:text-fd-foreground'
    }`;

  return (
    <div>
      {/* Search */}
      <div className="relative mb-5">
        <svg
          className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-fd-muted-foreground"
          width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search plugins by name, description, or tag…"
          aria-label="Search plugins"
          className="w-full rounded-xl bg-fd-card/60 py-2.5 pl-10 pr-4 text-sm text-fd-foreground outline-none transition-shadow placeholder:text-fd-muted-foreground focus:ring-2 focus:ring-fd-primary/40"
        />
      </div>

      {/* Filters */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <button type="button" className={chip(category === 'all')} onClick={() => setCategory('all')}>
          All categories
        </button>
        {categories.map((c) => (
          <button key={c.slug} type="button" className={chip(category === c.slug)} onClick={() => setCategory(c.slug)}>
            {c.name}
          </button>
        ))}
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          {TRUST_FILTERS.map((t) => (
            <button key={t.value} type="button" className={chip(trust === t.value)} onClick={() => setTrust(t.value)}>
              {t.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-fd-muted-foreground">
          <span className="sr-only">Filter by tag</span>
          <select
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            aria-label="Filter by tag"
            className="cursor-pointer rounded-full bg-fd-card/60 px-3 py-1 text-sm text-fd-foreground outline-none focus:ring-2 focus:ring-fd-primary/40"
          >
            <option value="all">All tags</option>
            {tags.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
      </div>

      <p className="mb-4 text-sm text-fd-muted-foreground">
        {results.length} {results.length === 1 ? 'plugin' : 'plugins'}
      </p>

      {results.length === 0 ? (
        <div className="rounded-xl bg-fd-card/50 px-6 py-16 text-center">
          <p className="text-fd-muted-foreground">No plugins match your filters.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((p) => (
            <PluginCard key={p.slug} plugin={p} categoryName={categoryNames.get(p.category) ?? p.category} />
          ))}
        </div>
      )}
    </div>
  );
}
