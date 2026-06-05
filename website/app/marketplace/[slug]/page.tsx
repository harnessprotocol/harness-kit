import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SiteNav } from '@/components/site/SiteNav';
import { SiteFooter } from '@/components/site/SiteFooter';
import { MarkdownViewer } from '@/components/markdown-viewer';
import { InstallWidget } from '@/components/marketplace/InstallWidget';
import { SecurityPanel } from '@/components/marketplace/SecurityPanel';
import { RankingBadges } from '@/components/marketplace/RankingBadges';
import { TrustBadge } from '@/components/marketplace/TrustBadge';
import { categoryAccent } from '@/lib/marketplace/category';
import { getAllPlugins, getCategoryName, getPlugin, getRepoStars } from '@/lib/marketplace/data';

export function generateStaticParams() {
  return getAllPlugins().map((p) => ({ slug: p.slug }));
}

export async function generateMetadata(props: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await props.params;
  const plugin = getPlugin(slug);
  if (!plugin) return { title: 'Plugin not found — Harness Kit' };
  return {
    title: `${plugin.name} — Harness Kit Marketplace`,
    description: plugin.description,
  };
}

export default async function PluginDetailPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const plugin = getPlugin(slug);
  if (!plugin) notFound();

  const accent = categoryAccent(plugin.category);
  const stars = getRepoStars();
  const repoUrl = `https://github.com/harnessprotocol/harness-kit/tree/main/${plugin.repoPath.replace(/^\.\//, '')}`;

  return (
    <main className="min-h-screen">
      <SiteNav />

      <article className="mx-auto max-w-3xl px-6 pb-24 pt-12">
        <Link href="/marketplace" className="text-sm text-fd-muted-foreground no-underline hover:text-fd-foreground">
          ← Marketplace
        </Link>

        {/* Header */}
        <header className="mb-8 mt-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span
              className="rounded-full px-2.5 py-0.5 text-xs font-medium"
              style={{ color: accent, background: `color-mix(in srgb, ${accent} 12%, transparent)` }}
            >
              {getCategoryName(plugin.category)}
            </span>
            {plugin.mcp && (
              <span
                className="rounded px-1.5 py-0.5 text-xs font-medium"
                style={{ background: 'var(--accent-light)', color: 'var(--accent-fg)' }}
              >
                MCP server
              </span>
            )}
          </div>
          <h1 className="font-display mb-2 flex items-baseline gap-3 text-3xl font-bold tracking-tight text-fd-foreground">
            {plugin.name}
            <span className="font-mono text-base font-normal text-fd-muted-foreground">v{plugin.version}</span>
          </h1>
          <p className="text-base leading-relaxed text-fd-muted-foreground">{plugin.description}</p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-fd-muted-foreground">
            <span>By {plugin.author}</span>
            <span>{plugin.license}</span>
            <a href={repoUrl} className="underline" target="_blank" rel="noreferrer">Source ↗</a>
          </div>
          <div className="mt-3">
            <RankingBadges sourceId={plugin.sourceId} trust={plugin.security.trust} stars={stars} />
          </div>
        </header>

        {/* Install */}
        <section className="mb-10">
          <h2 className="font-display mb-3 text-lg font-semibold text-fd-foreground">Install</h2>
          <InstallWidget kind="plugin" plugin={plugin} />
        </section>

        {/* Tags */}
        {plugin.tags.length > 0 && (
          <section className="mb-10 flex flex-wrap gap-2">
            {plugin.tags.map((t) => (
              <span key={t} className="rounded-full bg-fd-muted/70 px-2.5 py-0.5 text-xs text-fd-muted-foreground">
                {t}
              </span>
            ))}
          </section>
        )}

        {/* Environment requirements */}
        {plugin.requiresEnv.length > 0 && (
          <section className="mb-10">
            <h2 className="font-display mb-3 text-lg font-semibold text-fd-foreground">Environment</h2>
            <div className="flex flex-col gap-px overflow-hidden rounded-xl bg-fd-card/60">
              {plugin.requiresEnv.map((env) => (
                <div key={env.name} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="font-mono text-sm text-fd-foreground">{env.name}</code>
                    <span className="text-[11px] text-fd-muted-foreground">
                      {env.required ? 'required' : 'optional'}
                    </span>
                    {env.sensitive && (
                      <span className="rounded px-1.5 py-0.5 text-[11px] font-medium" style={{ background: 'color-mix(in srgb, #f59e0b 12%, transparent)', color: '#f59e0b' }}>
                        sensitive
                      </span>
                    )}
                  </div>
                  {env.description && <p className="mt-1 text-sm text-fd-muted-foreground">{env.description}</p>}
                  {env.when && <p className="mt-0.5 text-xs text-fd-muted-foreground">Used when: {env.when}</p>}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* MCP */}
        {plugin.mcp && (
          <section className="mb-10">
            <h2 className="font-display mb-3 text-lg font-semibold text-fd-foreground">MCP server</h2>
            <div className="rounded-xl bg-fd-card/60 px-4 py-3 font-mono text-sm text-fd-foreground">
              {plugin.mcp.command} {plugin.mcp.args.join(' ')}
              <span className="ml-2 text-xs text-fd-muted-foreground">({plugin.mcp.transport})</span>
            </div>
          </section>
        )}

        {/* Security */}
        <div className="mb-10">
          <SecurityPanel security={plugin.security} />
        </div>

        {/* Skills */}
        {plugin.skills.length > 0 && (
          <section>
            <h2 className="font-display mb-3 text-lg font-semibold text-fd-foreground">
              {plugin.skills.length === 1 ? 'Skill' : 'Skills'}
            </h2>
            <div className="flex flex-col gap-6">
              {plugin.skills.map((skill) => (
                <div key={skill.dir}>
                  <h3 className="mb-2 font-mono text-sm text-fd-muted-foreground">skills/{skill.dir}/SKILL.md</h3>
                  <MarkdownViewer content={skill.body} filename={`${skill.name}`} />
                </div>
              ))}
            </div>
          </section>
        )}
      </article>

      <SiteFooter />
    </main>
  );
}
