import Link from 'next/link';

const tiles = [
  {
    id: 'harness',
    title: 'Harness',
    description: 'Configure your AI tool setup — plugins, hooks, MCP servers, and CLAUDE.md.',
    href: '/docs/getting-started/installation',
    accent: 'var(--cat-blue, #3b82f6)',
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
    accent: 'var(--cat-cyan, #06b6d4)',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path d="M3 1a1 1 0 000 2h1.22l.305 1.222a.997.997 0 00.01.042l1.358 5.43-.893.892C3.74 11.846 4.632 14 6.414 14H15a1 1 0 000-2H6.414l1-1H14a1 1 0 00.894-.553l3-6A1 1 0 0017 3H6.28l-.31-1.243A1 1 0 005 1H3zM16 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM6.5 18a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" />
      </svg>
    ),
  },
  {
    id: 'observatory',
    title: 'Observatory',
    description: 'Measure and compare AI tool performance across sessions and dimensions.',
    href: '/docs/evals',
    accent: 'var(--cat-blue, #3b82f6)',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
      </svg>
    ),
  },
  {
    id: 'comparator',
    title: 'Comparator',
    description: 'Run the same prompt across multiple AI tools side by side. Find what works.',
    href: '/docs/cross-harness/concept-mapping',
    accent: 'var(--cat-cyan, #06b6d4)',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path d="M3 4a1 1 0 000 2h11.586l-2.293 2.293a1 1 0 001.414 1.414l4-4a1 1 0 000-1.414l-4-4a1 1 0 10-1.414 1.414L14.586 4H3zM17 16a1 1 0 000-2H5.414l2.293-2.293a1 1 0 00-1.414-1.414l-4 4a1 1 0 000 1.414l4 4a1 1 0 001.414-1.414L5.414 16H17z" />
      </svg>
    ),
  },
  {
    id: 'security',
    title: 'Security',
    description: 'Secrets management, permission models, and audit trail across your harness.',
    href: '/docs/guides/secrets-management',
    accent: 'var(--cat-green, #10b981)',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    id: 'parity',
    title: 'Parity',
    description: 'Track feature parity across Claude Code, Copilot, Cursor, and other harnesses.',
    href: '/docs/cross-harness/ide-support',
    accent: 'var(--cat-green, #10b981)',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
        <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm9.707 5.707a1 1 0 00-1.414-1.414L9 12.586l-1.293-1.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    id: 'board',
    title: 'Board',
    description: 'Project tracking built into your AI workflow. Kanban and roadmap views.',
    href: '/docs/plugins/productivity',
    accent: 'var(--cat-purple, #a855f7)',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path d="M2 4a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H3a1 1 0 01-1-1V4zM3 9a1 1 0 000 2h6a1 1 0 000-2H3zM3 14a1 1 0 000 2h6a1 1 0 000-2H3zM14 9a1 1 0 000 2h3a1 1 0 000-2h-3zM14 14a1 1 0 000 2h3a1 1 0 000-2h-3z" />
      </svg>
    ),
  },
  {
    id: 'memory',
    title: 'Memory',
    description: 'Knowledge graph and session context. Orient your AI in any repo, any session.',
    href: '/docs/plugins/research-knowledge',
    accent: 'var(--cat-purple, #a855f7)',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z" />
      </svg>
    ),
  },
  {
    id: 'concepts',
    title: 'Architecture',
    description: 'Plugins, skills, harness protocol, portability. How it all fits together.',
    href: '/docs/concepts',
    accent: 'var(--cat-blue, #3b82f6)',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path d="M7 3a1 1 0 000 2h6a1 1 0 100-2H7zM4 7a1 1 0 011-1h10a1 1 0 110 2H5a1 1 0 01-1-1zM2 11a2 2 0 012-2h12a2 2 0 012 2v4a2 2 0 01-2 2H4a2 2 0 01-2-2v-4z" />
      </svg>
    ),
  },
];

export default function ExplorePage() {
  return (
    <main className="min-h-screen animate-fade-in" style={{ background: 'var(--color-fd-background, #0b0d12)' }}>
      {/* Nav — reuse marketing home nav pattern */}
      <nav className="sticky top-0 z-50 border-b border-fd-border/30 bg-fd-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <a href="/" className="flex items-center gap-2.5 font-bold text-fd-foreground no-underline">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" className="size-6" style={{ filter: 'drop-shadow(0 0 5px rgba(34,177,236,0.4))' }}>
              <rect width="28" height="28" rx="6" fill="#0d1016" />
              <text x="14" y="19" textAnchor="middle" fontFamily="system-ui, sans-serif" fontWeight="700" fontSize="12" fill="#4ec7f2">hk</text>
            </svg>
            <span className="font-display">Harness Kit</span>
          </a>
          <div className="flex items-center gap-6 text-sm">
            <a href="/docs" className="text-fd-muted-foreground transition-colors hover:text-fd-foreground no-underline">Docs</a>
            <a href="/explore" className="text-fd-foreground font-medium no-underline">Explore</a>
            <a href="https://github.com/harnessprotocol/harness-kit" className="text-fd-muted-foreground transition-colors hover:text-fd-foreground no-underline" target="_blank" rel="noreferrer">GitHub</a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/4">
          <div className="h-[400px] w-[600px] rounded-full bg-sky-500/10 blur-[100px]" />
        </div>
        <div className="relative mx-auto max-w-4xl px-6 pb-12 pt-20 text-center">
          <h1 className="font-display mb-4 text-4xl font-bold tracking-tight text-fd-foreground sm:text-5xl">
            Explore{' '}
            <span className="bg-gradient-to-r from-sky-400 via-cyan-400 to-blue-500 bg-clip-text text-transparent">
              Harness Kit
            </span>
          </h1>
          <p className="mx-auto max-w-xl text-base leading-relaxed text-fd-muted-foreground">
            Every surface of your AI workflow, organized by purpose.
          </p>
        </div>
      </section>

      {/* Tiles */}
      <section className="mx-auto max-w-5xl px-6 pb-24">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tiles.map((tile) => (
            <Link
              key={tile.id}
              href={tile.href}
              className="group relative overflow-hidden rounded-xl border border-fd-border/50 bg-fd-card/80 p-6 no-underline backdrop-blur-sm transition-all duration-300 hover:border-fd-primary/30 hover:shadow-lg cursor-pointer"
              style={{
                borderTop: `2px solid ${tile.accent}`,
              }}
            >
              {/* Hover glow overlay */}
              <div
                className="pointer-events-none absolute inset-0 rounded-xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                style={{ background: `linear-gradient(164deg, color-mix(in srgb, ${tile.accent} 8%, transparent), transparent 60%)` }}
              />
              <div className="relative">
                {/* Icon */}
                <div
                  className="mb-4 flex size-9 items-center justify-center rounded-lg"
                  style={{ background: `color-mix(in srgb, ${tile.accent} 15%, transparent)`, color: tile.accent }}
                >
                  {tile.icon}
                </div>
                <h3 className="font-display mb-1.5 text-base font-semibold text-fd-foreground">
                  {tile.title}
                </h3>
                <p className="text-sm leading-relaxed text-fd-muted-foreground">
                  {tile.description}
                </p>
              </div>
              <div className="relative mt-4 text-sm font-medium opacity-0 transition-opacity duration-300 group-hover:opacity-100" style={{ color: tile.accent }}>
                Explore →
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-fd-border/30 px-6 py-6 text-center text-xs text-fd-muted-foreground">
        <a href="/" className="no-underline hover:text-fd-foreground transition-colors">← Back to home</a>
        <span className="mx-3 opacity-30">·</span>
        <a href="/docs" className="no-underline hover:text-fd-foreground transition-colors">Documentation</a>
      </footer>
    </main>
  );
}
