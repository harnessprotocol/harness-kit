import Link from 'next/link';

const MonitorIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect width="20" height="14" x="2" y="3" rx="2" />
    <path d="M8 21h8M12 17v4" />
  </svg>
);

const PuzzleIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M19.439 7.85c-.049.322.059.648.289.878l1.568 1.568c.47.47.706 1.087.706 1.704s-.235 1.233-.706 1.704l-1.611 1.611a.98.98 0 0 1-.837.276c-.47-.07-.802-.48-.968-.925a2.501 2.501 0 1 0-3.214 3.214c.446.166.855.497.925.968a.979.979 0 0 1-.276.837l-1.61 1.61a2.404 2.404 0 0 1-3.408 0l-1.569-1.568c-.23-.23-.556-.338-.878-.29-.493.074-.84.504-1.02.968a2.5 2.5 0 1 1-3.237-3.237c.464-.18.894-.527.967-1.02.049-.322-.059-.648-.289-.878L4.14 9.171a2.403 2.403 0 0 1 0-3.408l1.568-1.568c.23-.23.338-.556.29-.878-.075-.493-.504-.84-.968-1.02a2.5 2.5 0 1 1 3.237-3.237c.18.464.527.894 1.02.967.322.049.648-.059.878-.289l1.568-1.568a2.403 2.403 0 0 1 3.408 0l1.568 1.568c.23.23.556.338.879.29.493-.074.84-.504 1.019-.968a2.5 2.5 0 1 1 3.237 3.237c-.464.18-.894.527-.968 1.02Z" />
  </svg>
);

const TerminalIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="4 17 10 11 4 5" />
    <line x1="12" x2="20" y1="19" y2="19" />
  </svg>
);

const methods = [
  {
    id: 'desktop-app',
    icon: <MonitorIcon />,
    title: 'Desktop App',
    description: 'Observatory, Memory, Board, and AI Chat — all in one native app. The best way to see and manage your harness.',
    tags: ['Homebrew Cask', 'DMG'],
    href: '#desktop-app',
    featured: true,
  },
  {
    id: 'skills',
    icon: <PuzzleIcon />,
    title: 'Skills & Plugins',
    description: 'Slash commands for Claude Code. Add the marketplace, install any plugin by name.',
    tags: ['Plugin Marketplace', 'Install Script'],
    href: '#skills--plugins',
    featured: false,
  },
  {
    id: 'cli',
    icon: <TerminalIcon />,
    title: 'CLI',
    description: 'Compile harness.yaml, sync plugins, detect drift — from the terminal.',
    tags: ['Homebrew', 'npm', 'Binary'],
    href: '#cli',
    featured: false,
  },
];

export function InstallMethodCards() {
  return (
    <div className="not-prose my-6 grid gap-3 sm:grid-cols-3">
      {methods.map((m) => (
        <Link
          key={m.id}
          href={m.href}
          className="group relative flex flex-col gap-3 rounded-xl p-5 no-underline transition-all duration-200"
          style={{
            background: m.featured
              ? 'linear-gradient(135deg, rgba(34,177,236,0.10) 0%, rgba(34,177,236,0.04) 100%)'
              : 'var(--bg-surface)',
            border: m.featured
              ? '1px solid rgba(34,177,236,0.25)'
              : '1px solid var(--border-base)',
          }}
        >
          {m.featured && (
            <span
              className="absolute right-4 top-4 rounded-full px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide"
              style={{ background: 'rgba(34,177,236,0.15)', color: 'var(--accent)' }}
            >
              Start here
            </span>
          )}
          <div
            className="flex size-9 items-center justify-center rounded-lg"
            style={{
              background: m.featured ? 'rgba(34,177,236,0.15)' : 'var(--bg-elevated)',
              color: m.featured ? 'var(--accent)' : 'var(--fg-muted)',
            }}
          >
            {m.icon}
          </div>
          <div>
            <p
              className="mb-1 text-sm font-semibold"
              style={{ color: m.featured ? 'var(--accent)' : 'var(--fg-base)' }}
            >
              {m.title}
            </p>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--fg-muted)' }}>
              {m.description}
            </p>
          </div>
          <div className="mt-auto flex flex-wrap gap-1.5">
            {m.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-md px-1.5 py-0.5 text-[0.65rem] font-medium"
                style={{ background: 'var(--bg-elevated)', color: 'var(--fg-subtle)' }}
              >
                {tag}
              </span>
            ))}
          </div>
        </Link>
      ))}
    </div>
  );
}
