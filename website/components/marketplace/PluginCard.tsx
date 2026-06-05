import Link from 'next/link';
import type { MarketplacePlugin } from '@/lib/marketplace/types';
import { TrustBadge } from './TrustBadge';

export function PluginCard({ plugin, categoryName }: { plugin: MarketplacePlugin; categoryName: string }) {
  return (
    <Link
      href={`/marketplace/${plugin.slug}`}
      className="group surface-card flex cursor-pointer flex-col rounded-xl p-5 no-underline"
    >
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <span className="rounded-full bg-fd-muted px-2 py-0.5 text-[11px] font-medium text-fd-muted-foreground">
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

      <div className="flex items-center gap-2 text-[11px] text-fd-muted-foreground">
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
        {plugin.requiresEnv.length > 0 && <span>· needs env</span>}
      </div>
    </Link>
  );
}
