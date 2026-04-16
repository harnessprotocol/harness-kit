import type { ReactNode } from 'react';
import { SiteNav } from '@/components/site/SiteNav';
import { SiteFooter } from '@/components/site/SiteFooter';
import { HeroGlow } from '@/components/site/HeroGlow';
import { FeatureTile } from '@/components/site/FeatureTile';

interface Tile {
  id: string;
  title: string;
  description: string;
  href: string;
  accent: string;
  icon: ReactNode;
}

interface Group {
  label: string;
  tiles: Tile[];
}

const NAV_GROUPS: Group[] = [
  {
    label: 'CORE',
    tiles: [
      {
        id: 'harness',
        title: 'Harness',
        description: 'Configure your AI tool setup — plugins, hooks, MCP servers, and CLAUDE.md.',
        href: '/docs/getting-started/installation',
        accent: 'var(--cat-blue)',
        icon: (
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
          </svg>
        ),
      },
      {
        id: 'marketplace',
        title: 'Marketplace',
        description: 'Browse and install plugins by name. Research, review, data lineage, and more.',
        href: '/docs/plugins/overview',
        accent: 'var(--cat-cyan)',
        icon: (
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path d="M3 1a1 1 0 000 2h1.22l.305 1.222a.997.997 0 00.01.042l1.358 5.43-.893.892C3.74 11.846 4.632 14 6.414 14H15a1 1 0 000-2H6.414l1-1H14a1 1 0 00.894-.553l3-6A1 1 0 0017 3H6.28l-.31-1.243A1 1 0 005 1H3zM16 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM6.5 18a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" />
          </svg>
        ),
      },
    ],
  },
  {
    label: 'INSIGHTS',
    tiles: [
      {
        id: 'observatory',
        title: 'Observatory',
        description: 'Every session, every tool call, every minute. See what your AI actually did.',
        href: '/docs/evals',
        accent: 'var(--cat-blue)',
        icon: (
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
          </svg>
        ),
      },
      {
        id: 'agents',
        title: 'Agents',
        description: 'Monitor and control specialist subagents running across your harness — live status, output, and history.',
        href: '/docs/concepts/architecture',
        accent: 'var(--cat-purple)',
        icon: (
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        ),
      },
      {
        id: 'comparator',
        title: 'Comparator',
        description: 'Run the same prompt across Claude Code, Cursor, and Copilot side by side. Find what works.',
        href: '/docs/cross-harness/concept-mapping',
        accent: 'var(--cat-cyan)',
        icon: (
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path d="M3 4a1 1 0 000 2h11.586l-2.293 2.293a1 1 0 001.414 1.414l4-4a1 1 0 000-1.414l-4-4a1 1 0 10-1.414 1.414L14.586 4H3zM17 16a1 1 0 000-2H5.414l2.293-2.293a1 1 0 00-1.414-1.414l-4 4a1 1 0 000 1.414l4 4a1 1 0 001.414-1.414L5.414 16H17z" />
          </svg>
        ),
      },
    ],
  },
  {
    label: 'SYSTEM',
    tiles: [
      {
        id: 'security',
        title: 'Security',
        description: 'Permission rules, secrets management, and audit trail across your harness.',
        href: '/docs/guides/secrets-management',
        accent: 'var(--cat-green)',
        icon: (
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
        ),
      },
      {
        id: 'parity',
        title: 'Parity',
        description: 'Track which plugins, MCP servers, hooks, and skills are running on each AI tool.',
        href: '/docs/cross-harness/ide-support',
        accent: 'var(--cat-green)',
        icon: (
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
            <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm9.707 5.707a1 1 0 00-1.414-1.414L9 12.586l-1.293-1.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
        ),
      },
    ],
  },
  {
    label: 'WORKFLOWS',
    tiles: [
      {
        id: 'board',
        title: 'Board',
        description: 'Agents pick up cards, draft commits, open PRs. You review. Kanban built for AI-first teams.',
        href: '/docs/plugins/productivity',
        accent: 'var(--cat-purple)',
        icon: (
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path d="M2 4a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H3a1 1 0 01-1-1V4zM3 9a1 1 0 000 2h6a1 1 0 000-2H3zM3 14a1 1 0 000 2h6a1 1 0 000-2H3zM14 9a1 1 0 000 2h3a1 1 0 000-2h-3zM14 14a1 1 0 000 2h3a1 1 0 000-2h-3z" />
          </svg>
        ),
      },
      {
        id: 'roadmap',
        title: 'Roadmap',
        description: 'AI-generated quarterly roadmaps and competitor analysis, tied to your board and harness.',
        href: '/docs/plugins/productivity',
        accent: 'var(--cat-purple)',
        icon: (
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
          </svg>
        ),
      },
      {
        id: 'ai-chat',
        title: 'AI Chat',
        description: 'Keyboard-first chat tied to your harness. Pipe files in, stream tool calls, keep every conversation.',
        href: '/docs/plugins/overview',
        accent: 'var(--cat-blue)',
        icon: (
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z" />
            <path d="M15 7v2a4 4 0 01-4 4H9.828l-1.766 1.767c.28.149.599.233.938.233h2l3 3v-3h2a2 2 0 002-2V9a2 2 0 00-2-2h-1z" />
          </svg>
        ),
      },
      {
        id: 'memory',
        title: 'Memory',
        description: 'A knowledge graph your AI can orient itself in. Teammates, decisions, conventions — persistent across every tool.',
        href: '/docs/plugins/research-knowledge',
        accent: 'var(--cat-cyan)',
        icon: (
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z" />
          </svg>
        ),
      },
    ],
  },
];

export default function ExplorePage() {
  return (
    <main className="min-h-screen">
      <SiteNav />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <HeroGlow />
        <div className="relative mx-auto max-w-4xl px-6 pb-12 pt-20 text-center">
          <h1 className="font-display mb-4 text-4xl font-bold tracking-tight text-fd-foreground sm:text-5xl">
            Explore Harness Kit
          </h1>
          <p className="mx-auto max-w-xl text-base leading-relaxed text-fd-muted-foreground">
            Eleven surfaces. One keyboard. Everything your AI coding tool forgot to give you.
          </p>
        </div>
      </section>

      {/* Grouped tiles */}
      <section className="mx-auto max-w-5xl px-6 pb-24">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-12">
            <div
              className="mb-4 text-xs font-semibold uppercase tracking-[0.07em]"
              style={{ color: 'var(--fg-subtle)' }}
            >
              {group.label}
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {group.tiles.map((tile) => (
                <FeatureTile
                  key={tile.id}
                  icon={tile.icon}
                  title={tile.title}
                  description={tile.description}
                  href={tile.href}
                  accent={tile.accent}
                />
              ))}
            </div>
          </div>
        ))}
      </section>

      <SiteFooter />
    </main>
  );
}
