import Link from 'next/link';
import type { MarketplacePlugin } from '@/lib/marketplace/types';
import { TrustBadge } from './TrustBadge';
import { categoryAccent } from '@/lib/marketplace/category';

export function PluginCard({ plugin, categoryName }: { plugin: MarketplacePlugin; categoryName: string }) {
  const accent = categoryAccent(plugin.category);
  const needsKey = plugin.requiresEnv.some((e) => e.sensitive);

  return (
    <Link
      href={`/marketplace/${plugin.slug}`}
      className="group surface-card flex cursor-pointer flex-col rounded-xl p-5 no-underline"
    >
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <span
          className="rounded-full px-2 py-0.5 text-[11px] font-medium"
          style={{ color: accent, background: `color-mix(in srgb, ${accent} 12%, transparent)` }}
        >
          {categoryName}
        </span>
        <TrustBadge tier={plugin.security.trust} />
      </div>

      <div className="mb-1 flex items-baseline gap-2">
        <h3 className="font-semibold text-fd-foreground">{plugin.name}</h3>
        <span className="font-mono text-xs text-fd-muted-foreground">v{plugin.version}</span>
      </div>

      <p className="mb-3 line-clamp-3 flex-1 text-sm leading-relaxed text-fd-muted-foreground">
        {plugin.description}
      </p>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-fd-muted-foreground">
        {plugin.mcp && (
          <span
            className="rounded px-1.5 py-0.5 font-medium"
            style={{ background: 'var(--accent-light)', color: 'var(--accent-fg)' }}
          >
            MCP
          </span>
        )}
        {plugin.skills.length > 0 && (
          <span>
            {plugin.skills.length} skill{plugin.skills.length === 1 ? '' : 's'}
          </span>
        )}
        {plugin.requiresEnv.length > 0 && (
          <span className="inline-flex items-center gap-1">
            <span className="text-fd-muted-foreground/40">·</span>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3" />
            </svg>
            {needsKey ? 'API key' : 'env var'}
          </span>
        )}
      </div>
    </Link>
  );
}
