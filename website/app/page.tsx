import Link from 'next/link';
import { SiteNav } from '@/components/site/SiteNav';
import { SiteFooter } from '@/components/site/SiteFooter';
import { CommandBox } from '@/components/site/CommandBox';
import { SectionHeader } from '@/components/site/SectionHeader';
import { FeatureTile } from '@/components/site/FeatureTile';
import { DesktopMock } from '@/components/site/DesktopMock';

/* ── Icons (inline SVG, no icon library) ── */
const ConfigureIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const ObserveIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const ShareIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
  </svg>
);

const features = [
  {
    icon: <ConfigureIcon />,
    title: 'Configure',
    description:
      'Plugins, skills, MCP servers, hooks — all declared in one harness.yaml. Install by name. No git clone, no path juggling, no "run this script first."',
  },
  {
    icon: <ObserveIcon />,
    title: 'Observe',
    description:
      'Every session, every tool call, every minute. Observatory and Memory show you what your AI actually did, so you can trust it, tune it, or prove it.',
  },
  {
    icon: <ShareIcon />,
    title: 'Share',
    description:
      "Your whole setup fits in one file. Hand it to a teammate and they're running exactly what you run — same plugins, same skills, same workflows.",
  },
];

const showcaseCards = [
  {
    section: 'observatory' as const,
    title: 'Observatory · know what your AI actually did',
    desc: 'Every session, every tool call, every minute. Trends you can point at when someone asks "is this thing working."',
  },
  {
    section: 'memory' as const,
    title: 'Memory · the context that outlasts the session',
    desc: 'A knowledge graph your AI can orient itself in. Teammates, decisions, conventions — persistent across every tool.',
  },
  {
    section: 'board' as const,
    title: "Board · your AI's to-do list, not yours",
    desc: 'Agents pick up cards, draft commits, open PRs. You review. The kanban is built for AI-first teams.',
  },
  {
    section: 'ai-chat' as const,
    title: 'AI Chat · the terminal, but nicer',
    desc: 'A keyboard-first chat window tied to your harness. Pipe files in, stream tool calls, keep every conversation.',
  },
];

export default function HomePage() {
  return (
    <main className="min-h-screen">
      <SiteNav />

      {/* ── Hero ── */}
      <section className="relative overflow-hidden border-b border-fd-border/30">
        {/* Copy block */}
        <div className="mx-auto max-w-3xl px-6 pb-10 pt-20 text-center">
          <h1 className="font-display mb-5 text-[2.6rem] font-bold leading-tight tracking-tight text-fd-foreground sm:text-5xl">
            The configuration console<br className="hidden sm:block" />
            for all your harnesses.
          </h1>
          <p className="mx-auto mb-8 max-w-lg text-lg leading-relaxed text-fd-muted-foreground">
            Configure, observe, and share your harness from one native app, built on an open harness.yaml spec.
          </p>
          <div className="mb-8 flex justify-center">
            <CommandBox command="/plugin marketplace add harnessprotocol/harness-kit" />
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/docs/getting-started/installation"
              className="rounded-lg px-5 py-2.5 text-sm font-semibold text-white no-underline transition-all hover:opacity-90"
              style={{ background: 'var(--accent)', boxShadow: '0 2px 12px var(--accent-glow)' }}
            >
              Get started
            </Link>
            <Link
              href="/explore"
              className="rounded-lg border px-5 py-2.5 text-sm font-medium text-fd-foreground no-underline transition-all hover:border-fd-primary/40"
              style={{ borderColor: 'var(--border-strong)', background: 'var(--bg-elevated)' }}
            >
              Explore the app →
            </Link>
          </div>
        </div>

        {/* Product hero — the app is the hero */}
        <div className="mx-auto max-w-5xl px-4 pb-16 sm:px-6">
          <DesktopMock interactive defaultSection="observatory" />
        </div>
      </section>

      {/* ── What's a harness? ── */}
      <section className="border-b border-fd-border/30 py-20">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <div
            className="mb-3 text-xs font-semibold uppercase tracking-[0.1em]"
            style={{ color: 'var(--accent)' }}
          >
            First time here?
          </div>
          <h2 className="font-display mb-6 text-3xl font-bold tracking-tight text-fd-foreground sm:text-4xl">
            What&apos;s a harness?
          </h2>
          <p className="text-base leading-relaxed text-fd-muted-foreground">
            Every AI coding tool has its own setup folder — Claude Code&apos;s{' '}
            <code className="rounded bg-fd-accent px-1.5 py-0.5 font-mono text-sm">~/.claude</code>,
            {' '}Cursor&apos;s{' '}
            <code className="rounded bg-fd-accent px-1.5 py-0.5 font-mono text-sm">.cursor</code>,
            {' '}Copilot&apos;s config, and whatever shows up next month. Different names, same shape,
            totally incompatible.{' '}
            <strong className="font-semibold text-fd-foreground">harness-kit</strong>{' '}
            is the layer that turns all of them into one setup you carry with you.
          </p>
        </div>
      </section>

      {/* ── App showcase strip ── */}
      <section
        className="border-b border-fd-border/30 py-24"
        style={{ background: 'var(--bg-base)' }}
      >
        <div className="mx-auto max-w-6xl px-6">
          <SectionHeader
            eyebrow="The desktop app"
            title="Eleven surfaces, one keyboard"
            subtitle="Observability, memory, a plugin marketplace, a kanban board, AI chat, cross-harness parity — everything your AI coding tool forgot to give you, in one keyboard-first app."
          />
          <div className="grid gap-8 sm:grid-cols-2">
            {showcaseCards.map((card) => (
              <div key={card.section}>
                <DesktopMock
                  interactive={false}
                  defaultSection={card.section}
                  compact
                />
                <div className="mt-4 px-1">
                  <p className="mb-1 text-sm font-semibold text-fd-foreground">{card.title}</p>
                  <p className="text-sm leading-relaxed text-fd-muted-foreground">{card.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works: Configure · Observe · Share ── */}
      <section className="border-b border-fd-border/30 py-24">
        <div className="mx-auto max-w-5xl px-6">
          <SectionHeader
            eyebrow="How it works"
            title="Configure. Observe. Share."
            subtitle="That's the whole loop. Your harness travels with you to every machine, every tool, every teammate."
          />
          <div className="grid gap-6 sm:grid-cols-3">
            {features.map((f) => (
              <FeatureTile key={f.title} icon={f.icon} title={f.title} description={f.description} />
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA band ── */}
      <section className="py-24 text-center">
        <div className="mx-auto max-w-2xl px-6">
          <h2 className="font-display mb-4 text-3xl font-bold tracking-tight text-fd-foreground sm:text-4xl">
            Stop rebuilding your setup.
          </h2>
          <p className="mb-8 text-lg text-fd-muted-foreground">
            One file. Every tool. Every machine. Every teammate.
          </p>
          <Link
            href="/docs/getting-started/installation"
            className="inline-flex items-center rounded-lg px-6 py-3 text-sm font-semibold text-white no-underline transition-all hover:opacity-90"
            style={{ background: 'var(--accent)', boxShadow: '0 4px 20px var(--accent-glow)' }}
          >
            Get started →
          </Link>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
