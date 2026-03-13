import Link from 'next/link';

/* ── Lucide SVG icons (inline, no package needed) ── */
const DownloadIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const WorkflowIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="3" width="8" height="8" rx="2" />
    <path d="M7 11v4a2 2 0 0 0 2 2h4" />
    <rect x="13" y="13" width="8" height="8" rx="2" />
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
    title: 'Install once, use everywhere',
    description:
      'Install by name. Plugins follow you across every project without manual setup.',
    icon: <DownloadIcon />,
  },
  {
    title: 'More than prompts',
    description:
      'Each plugin encodes a complete workflow — what to gather, how to analyze it, what to produce.',
    icon: <WorkflowIcon />,
  },
  {
    title: 'Share your setup',
    description:
      "Export your full setup as a harness.yaml. Share it with a teammate and they're running the same workflows.",
    icon: <ShareIcon />,
  },
];

const plugins = [
  {
    name: 'research',
    description:
      'Process any source into a structured, compounding knowledge base.',
    href: '/docs/plugins/research',
  },
  {
    name: 'explain',
    description:
      'Layered explanations of files, functions, directories, or concepts.',
    href: '/docs/plugins/explain',
  },
  {
    name: 'data-lineage',
    description:
      'Column-level lineage tracing through SQL, Kafka, Spark, and JDBC.',
    href: '/docs/plugins/data-lineage',
  },
  {
    name: 'orient',
    description:
      'Topic-focused session orientation across graph, knowledge, and research.',
    href: '/docs/plugins/orient',
  },
  {
    name: 'capture-session',
    description:
      'Capture session information into a staging file for later reflection.',
    href: '/docs/plugins/capture-session',
  },
  {
    name: 'review',
    description:
      'Code review for a branch, PR, or path — severity labels and cross-file analysis.',
    href: '/docs/plugins/review',
  },
  {
    name: 'docgen',
    description:
      'Generate or update README, API docs, architecture overview, or changelog.',
    href: '/docs/plugins/docgen',
  },
];

const heroCards = [
  {
    title: 'Getting Started',
    description: 'Install your first plugin in under a minute.',
    href: '/docs/getting-started/installation',
  },
  {
    title: 'Browse Plugins',
    description: '7 plugins shipping today. Each packages a proven workflow.',
    href: '/docs/plugins/overview',
  },
  {
    title: 'Architecture',
    description: 'How skills, plugins, and the registry fit together.',
    href: '/docs/concepts/architecture',
  },
  {
    title: 'Cross-Harness',
    description: 'One config, every tool. Designed for portability across Claude Code, Copilot, Cursor, and more.',
    href: '/docs/cross-harness/setup-guide',
  },
];

export default function HomePage() {
  return (
    <main className="min-h-screen animate-fade-in">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-fd-border/30 bg-fd-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2.5 font-bold text-fd-foreground no-underline">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 32 32"
              className="size-7"
            >
              <rect width="32" height="32" rx="6" fill="#0d0d12" />
              <text
                x="16"
                y="22"
                textAnchor="middle"
                fontFamily="system-ui, sans-serif"
                fontWeight="700"
                fontSize="16"
                fill="#8b7aff"
              >
                hk
              </text>
            </svg>
            <span className="font-display">Harness Kit</span>
          </Link>
          <div className="flex items-center gap-6 text-sm">
            <Link
              href="/docs"
              className="text-fd-muted-foreground transition-colors hover:text-fd-foreground no-underline"
            >
              Docs
            </Link>
            <Link
              href="/docs/plugins/overview"
              className="text-fd-muted-foreground transition-colors hover:text-fd-foreground no-underline"
            >
              Plugins
            </Link>
            <a
              href="https://github.com/harnessprotocol/harness-kit"
              className="text-fd-muted-foreground transition-colors hover:text-fd-foreground no-underline"
              target="_blank"
              rel="noreferrer"
            >
              GitHub
            </a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden">
        {/* Ambient glow orb */}
        <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/4">
          <div className="h-[500px] w-[700px] rounded-full bg-purple-500/15 blur-[120px]" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-violet-500/5 via-transparent to-transparent" />

        <div className="relative mx-auto max-w-4xl px-6 pb-16 pt-28 text-center">
          <h1 className="font-display mb-5 text-5xl font-bold tracking-tight text-fd-foreground sm:text-6xl lg:text-7xl">
            Your harness,{' '}
            <span className="bg-gradient-to-r from-violet-400 to-purple-500 bg-clip-text text-transparent">
              everywhere
            </span>
          </h1>
          <p className="mx-auto mb-10 max-w-2xl text-lg leading-relaxed text-fd-muted-foreground">
            The configuration framework for AI coding tools.
            Install workflows by name, share your setup across teams and machines,
            and never rebuild from scratch again.
          </p>

          {/* Command box with gradient border */}
          <div className="relative mx-auto mb-8 inline-block">
            <div className="absolute -inset-[1px] rounded-xl bg-gradient-to-r from-violet-500/30 via-purple-500/20 to-indigo-500/30 blur-[1px]" />
            <div className="relative rounded-xl border border-white/5 bg-fd-card px-6 py-3.5 font-mono text-sm text-fd-foreground">
              <span className="text-fd-muted-foreground">$</span>{' '}
              /plugin marketplace add harnessprotocol/harness-kit
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/docs/getting-started/installation"
              className="rounded-lg bg-violet-500 px-6 py-2.5 text-sm font-medium text-white no-underline shadow-lg shadow-violet-500/20 transition-all hover:bg-violet-600 hover:shadow-violet-500/30"
            >
              Get Started
            </Link>
            <Link
              href="/docs/plugins/overview"
              className="glass rounded-lg border border-white/10 px-6 py-2.5 text-sm font-medium text-fd-foreground no-underline transition-all hover:border-fd-primary/40 hover:bg-fd-accent/50"
            >
              Browse Plugins
            </Link>
          </div>
        </div>
      </section>

      {/* Hero Cards */}
      <section className="mx-auto max-w-5xl px-6 pb-24">
        <div className="grid gap-4 sm:grid-cols-2">
          {heroCards.map((card) => (
            <Link
              key={card.title}
              href={card.href}
              className="group relative overflow-hidden rounded-xl border border-fd-border/50 bg-fd-card/80 p-6 no-underline backdrop-blur-sm transition-all duration-300 hover:border-fd-primary/30 hover:shadow-lg hover:shadow-violet-500/10"
            >
              {/* Gradient border overlay */}
              <div className="pointer-events-none absolute inset-0 rounded-xl opacity-0 transition-opacity duration-300 group-hover:opacity-100" style={{ background: 'linear-gradient(164deg, rgba(139,122,255,0.08), transparent 60%)' }} />
              <div className="relative">
                <h3 className="font-display mb-2 text-lg font-semibold text-fd-foreground">
                  {card.title}
                </h3>
                <p className="text-sm leading-relaxed text-fd-muted-foreground">
                  {card.description}
                </p>
              </div>
              <div className="relative mt-4 text-sm font-medium text-fd-primary opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                Explore →
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="relative border-t border-fd-border/30 bg-fd-card/30">
        {/* Subtle radial gradient background */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,hsla(256,80%,60%,0.04),transparent_70%)]" />
        <div className="relative mx-auto max-w-5xl px-6 py-24">
          <h2 className="font-display mb-2 text-center text-3xl font-bold text-fd-foreground">
            How it works
          </h2>
          <p className="mb-14 text-center text-fd-muted-foreground">
            Install a plugin, invoke a command, get a repeatable workflow.
          </p>
          <div className="grid gap-6 sm:grid-cols-3">
            {features.map((f) => (
              <div
                key={f.title}
                className="rounded-xl border border-fd-border/50 bg-fd-background/80 p-6 backdrop-blur-sm transition-all duration-300 hover:border-fd-primary/20 hover:shadow-lg hover:shadow-violet-500/5"
              >
                <div className="mb-4 flex size-10 items-center justify-center rounded-lg bg-fd-accent text-fd-primary">
                  {f.icon}
                </div>
                <h3 className="font-display mb-2 font-semibold text-fd-foreground">
                  {f.title}
                </h3>
                <p className="text-sm leading-relaxed text-fd-muted-foreground">
                  {f.description}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-12 text-center text-sm text-fd-muted-foreground">
            harness-kit is the reference implementation of the{' '}
            <a
              href="https://harnessprotocol.ai"
              className="text-fd-primary no-underline hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              Harness Protocol
            </a>
            , an open specification for portable AI tool configuration.
          </p>
        </div>
      </section>

      {/* Plugin showcase */}
      <section className="mx-auto max-w-5xl px-6 py-24">
        <h2 className="font-display mb-2 text-center text-3xl font-bold text-fd-foreground">
          7 plugins
        </h2>
        <p className="mb-14 text-center text-fd-muted-foreground">
          Each packages a proven workflow as a portable command.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {plugins.map((p) => (
            <Link
              key={p.name}
              href={p.href}
              className="group rounded-xl border border-fd-border/50 bg-fd-card/80 p-5 no-underline transition-all duration-300 hover:border-fd-primary/30 hover:shadow-lg hover:shadow-violet-500/10"
            >
              <h4 className="mb-1.5 font-mono text-sm font-semibold text-fd-primary brightness-110">
                {p.name}
              </h4>
              <p className="text-sm leading-relaxed text-fd-muted-foreground">
                {p.description}
              </p>
            </Link>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="relative border-t border-fd-border/30">
        {/* Top gradient border */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-fd-primary/20 to-transparent" />
        <div className="mx-auto grid max-w-5xl gap-8 px-6 py-12 text-sm sm:grid-cols-3">
          {/* Brand */}
          <div>
            <div className="mb-3 flex items-center gap-2 font-bold text-fd-foreground">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 32 32"
                className="size-6"
              >
                <rect width="32" height="32" rx="6" fill="#0d0d12" />
                <text
                  x="16"
                  y="22"
                  textAnchor="middle"
                  fontFamily="system-ui, sans-serif"
                  fontWeight="700"
                  fontSize="16"
                  fill="#8b7aff"
                >
                  hk
                </text>
              </svg>
              <span className="font-display">Harness Kit</span>
            </div>
            <p className="text-fd-muted-foreground">
              A harness-agnostic framework for AI coding tools.
            </p>
          </div>
          {/* Links */}
          <div>
            <h5 className="mb-3 font-semibold text-fd-foreground">Resources</h5>
            <ul className="space-y-2 text-fd-muted-foreground">
              <li>
                <Link href="/docs" className="transition-colors hover:text-fd-foreground no-underline">
                  Documentation
                </Link>
              </li>
              <li>
                <Link href="/docs/plugins/overview" className="transition-colors hover:text-fd-foreground no-underline">
                  Plugins
                </Link>
              </li>
              <li>
                <a
                  href="https://github.com/harnessprotocol/harness-kit"
                  className="transition-colors hover:text-fd-foreground no-underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  GitHub
                </a>
              </li>
            </ul>
          </div>
          {/* Legal */}
          <div>
            <h5 className="mb-3 font-semibold text-fd-foreground">Legal</h5>
            <ul className="space-y-2 text-fd-muted-foreground">
              <li>Apache-2.0 License</li>
              <li>
                <a
                  href="https://harnessprotocol.ai"
                  className="transition-colors hover:text-fd-foreground no-underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  Harness Protocol
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="border-t border-fd-border/20 px-6 py-4 text-center text-xs text-fd-muted-foreground">
          © {new Date().getFullYear()} Harness Kit Contributors
        </div>
      </footer>
    </main>
  );
}
