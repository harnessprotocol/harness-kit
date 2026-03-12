import Link from 'next/link';

const features = [
  {
    title: 'Install once, use everywhere',
    description:
      'Install by name. Plugins follow you across every project without manual setup.',
    icon: '→',
  },
  {
    title: 'More than prompts',
    description:
      'Each plugin encodes a complete workflow — what to gather, how to analyze it, what to produce.',
    icon: '◈',
  },
  {
    title: 'Share your setup',
    description:
      "Export your full setup as a harness.yaml. Share it with a teammate and they're running the same workflows.",
    icon: '⇄',
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
    gradient: 'from-violet-500/20 to-purple-600/20',
  },
  {
    title: 'Browse Plugins',
    description: '7 plugins shipping today. Each packages a proven workflow.',
    href: '/docs/plugins/overview',
    gradient: 'from-purple-500/20 to-indigo-600/20',
  },
  {
    title: 'Architecture',
    description: 'How skills, plugins, and the registry fit together.',
    href: '/docs/concepts/architecture',
    gradient: 'from-indigo-500/20 to-blue-600/20',
  },
  {
    title: 'Cross-Harness',
    description: 'One config, every tool. Designed for portability across Claude Code, Copilot, Cursor, and more.',
    href: '/docs/cross-harness/setup-guide',
    gradient: 'from-blue-500/20 to-cyan-600/20',
  },
];

export default function HomePage() {
  return (
    <main className="min-h-screen">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-fd-border/50 bg-fd-background/80 backdrop-blur-xl">
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
            Harness Kit
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
        <div className="absolute inset-0 bg-gradient-to-b from-violet-500/5 via-transparent to-transparent" />
        <div className="relative mx-auto max-w-4xl px-6 pb-16 pt-24 text-center">
          <h1 className="mb-4 text-5xl font-bold tracking-tight text-fd-foreground sm:text-6xl">
            Your harness,{' '}
            <span className="bg-gradient-to-r from-violet-400 to-purple-500 bg-clip-text text-transparent">
              everywhere
            </span>
          </h1>
          <p className="mx-auto mb-8 max-w-2xl text-lg text-fd-muted-foreground">
            The configuration framework for AI coding tools.
            Install workflows by name, share your setup across teams and machines,
            and never rebuild from scratch again.
          </p>
          <div className="mb-6 inline-block rounded-lg border border-fd-border bg-fd-card px-5 py-3 font-mono text-sm text-fd-foreground">
            /plugin marketplace add harnessprotocol/harness-kit
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/docs/getting-started/installation"
              className="rounded-lg bg-violet-500 px-5 py-2.5 text-sm font-medium text-white no-underline transition-colors hover:bg-violet-600"
            >
              Get Started
            </Link>
            <Link
              href="/docs/plugins/overview"
              className="rounded-lg border border-fd-border bg-fd-card px-5 py-2.5 text-sm font-medium text-fd-foreground no-underline transition-colors hover:border-fd-primary/50 hover:bg-fd-accent"
            >
              Browse Plugins
            </Link>
          </div>
        </div>
      </section>

      {/* Hero Cards — Supermemory-inspired grid */}
      <section className="mx-auto max-w-5xl px-6 pb-20">
        <div className="grid gap-4 sm:grid-cols-2">
          {heroCards.map((card) => (
            <Link
              key={card.title}
              href={card.href}
              className="group relative overflow-hidden rounded-xl border border-fd-border bg-fd-card p-6 no-underline transition-all hover:border-fd-primary/40 hover:shadow-lg hover:shadow-violet-500/5"
            >
              <div
                className={`absolute inset-0 bg-gradient-to-br ${card.gradient} opacity-0 transition-opacity group-hover:opacity-100`}
              />
              <div className="relative">
                <h3 className="mb-2 text-lg font-semibold text-fd-foreground">
                  {card.title}
                </h3>
                <p className="text-sm text-fd-muted-foreground">
                  {card.description}
                </p>
              </div>
              <div className="relative mt-4 text-sm font-medium text-fd-primary opacity-0 transition-opacity group-hover:opacity-100">
                Explore →
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-fd-border bg-fd-card/50">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <h2 className="mb-2 text-center text-3xl font-bold text-fd-foreground">
            How it works
          </h2>
          <p className="mb-12 text-center text-fd-muted-foreground">
            Install a plugin, invoke a command, get a repeatable workflow.
          </p>
          <div className="grid gap-6 sm:grid-cols-3">
            {features.map((f) => (
              <div
                key={f.title}
                className="rounded-xl border border-fd-border bg-fd-background p-6"
              >
                <div className="mb-4 flex size-10 items-center justify-center rounded-lg bg-fd-accent text-lg text-fd-primary">
                  {f.icon}
                </div>
                <h3 className="mb-2 font-semibold text-fd-foreground">
                  {f.title}
                </h3>
                <p className="text-sm leading-relaxed text-fd-muted-foreground">
                  {f.description}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-10 text-center text-sm text-fd-muted-foreground">
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
      <section className="mx-auto max-w-5xl px-6 py-20">
        <h2 className="mb-2 text-center text-3xl font-bold text-fd-foreground">
          7 plugins
        </h2>
        <p className="mb-12 text-center text-fd-muted-foreground">
          Each packages a proven workflow as a portable command.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {plugins.map((p) => (
            <Link
              key={p.name}
              href={p.href}
              className="group rounded-xl border border-fd-border bg-fd-card p-5 no-underline transition-all hover:border-fd-primary/40 hover:shadow-lg hover:shadow-violet-500/5"
            >
              <h4 className="mb-1.5 font-mono text-sm font-semibold text-fd-primary">
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
      <footer className="border-t border-fd-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6 text-sm text-fd-muted-foreground">
          <span>Apache-2.0 License</span>
          <a
            href="https://github.com/harnessprotocol/harness-kit"
            className="text-fd-muted-foreground transition-colors hover:text-fd-foreground no-underline"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
        </div>
      </footer>
    </main>
  );
}
