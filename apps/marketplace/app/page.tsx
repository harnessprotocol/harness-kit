import Link from "next/link";
import { CategoryIcon } from "@/app/components/CategoryIcon";
import { HeroSearch } from "@/app/components/HeroSearch";
import { StatsBar } from "@/app/components/StatsBar";
import { TrustBadge } from "@/app/components/TrustBadge";
import { supabase } from "@/lib/supabase";
import type { Component } from "@/lib/types";

const CATEGORIES = [
  {
    slug: "research-knowledge",
    name: "Research & Knowledge",
    description: "Build compounding knowledge bases from any source",
  },
  {
    slug: "code-quality",
    name: "Code Quality",
    description: "Reviews, explanations, and static analysis",
  },
  {
    slug: "data-engineering",
    name: "Data Engineering",
    description: "Lineage tracing, SQL analysis, and pipeline tools",
  },
  {
    slug: "documentation",
    name: "Documentation",
    description: "Generate READMEs, API docs, and changelogs",
  },
  {
    slug: "devops",
    name: "DevOps & Shipping",
    description: "CI/CD, PR workflows, and deployment automation",
  },
  {
    slug: "productivity",
    name: "Productivity",
    description: "Configuration sharing, session capture, and workflow tools",
  },
  {
    slug: "design",
    name: "Design",
    description: "Production-grade frontend design rules for typography, color, and UX",
  },
];

const SEED_TOTAL_INSTALLS = 8950;

function PluginCardFeatured({ component }: { component: Component }) {
  return (
    <Link
      href={`/plugins/${component.slug}`}
      className="group relative rounded-xl border border-[#2a2a2e] bg-[#141416] p-6 transition-all duration-300 hover:border-violet-500/30 hover:shadow-lg hover:shadow-violet-500/10 cursor-pointer"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="font-display font-semibold text-gray-100 transition-colors duration-200 group-hover:text-violet-400">
              {component.name}
            </span>
            <TrustBadge tier={component.trust_tier} />
            <span className="rounded-full border border-[#2a2a2e] bg-[#1a1a1e] px-2 py-0.5 text-xs text-gray-500">
              {component.type}
            </span>
          </div>
          <p className="text-sm leading-relaxed text-gray-400 line-clamp-2">
            {component.description}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-display text-sm font-semibold text-gray-200">
            {component.install_count.toLocaleString()}
          </div>
          <div className="text-xs text-gray-500">installs</div>
        </div>
      </div>
    </Link>
  );
}

function PluginCard({ component }: { component: Component }) {
  return (
    <Link
      href={`/plugins/${component.slug}`}
      className="group flex items-start justify-between gap-3 rounded-xl border border-[#2a2a2e] bg-[#141416] p-4 transition-all duration-300 hover:border-violet-500/30 hover:shadow-lg hover:shadow-violet-500/5 cursor-pointer"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-100 transition-colors duration-200 group-hover:text-violet-400">
            {component.name}
          </span>
          <TrustBadge tier={component.trust_tier} />
        </div>
        <p className="mt-1 truncate text-xs text-gray-500">{component.description}</p>
      </div>
      <div className="shrink-0 text-right text-xs text-gray-500">
        {component.install_count.toLocaleString()}
      </div>
    </Link>
  );
}

export default async function HomePage() {
  let trending: Component[] = [];
  let pluginCount = 16;
  let totalInstalls = SEED_TOTAL_INSTALLS;

  try {
    const [trendingResult, countResult] = await Promise.all([
      supabase.from("components").select("*").order("install_count", { ascending: false }).limit(8),
      supabase.from("components").select("*", { count: "exact", head: true }),
    ]);

    trending = (trendingResult.data as Component[]) ?? [];

    if (countResult.count != null) {
      pluginCount = countResult.count;
    }

    if (trending.length > 0) {
      const trendingTotal = trending.reduce((sum, c) => sum + c.install_count, 0);
      // Use trending total as a floor; if we have more plugins, estimate conservatively
      totalInstalls =
        pluginCount > trending.length
          ? Math.round((trendingTotal / trending.length) * pluginCount * 0.6)
          : trendingTotal;
    }
  } catch {
    // Supabase not configured — render with fallback data
  }

  return (
    <div className="animate-fade-in -mx-6 -my-12">
      {/* ── Hero ──────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        {/* Ambient glow */}
        <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/4">
          <div className="h-[500px] w-[700px] rounded-full bg-purple-500/15 blur-[120px]" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-violet-500/5 via-transparent to-transparent" />

        <div className="relative mx-auto max-w-4xl px-6 pb-16 pt-24 text-center">
          <h1 className="font-display mb-5 text-5xl font-bold sm:text-6xl">
            Extend Claude Code with{" "}
            <span className="bg-gradient-to-r from-violet-400 to-purple-500 bg-clip-text text-transparent">
              proven workflows
            </span>
          </h1>
          <p className="mx-auto mb-10 max-w-2xl text-lg leading-relaxed text-gray-400">
            Browse, search, and install skills, agents, and configuration — the parts worth sharing.
          </p>

          <HeroSearch />

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/plugins"
              className="cursor-pointer rounded-lg bg-violet-600 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-violet-500/20 transition-all duration-200 hover:bg-violet-500 hover:shadow-violet-500/30"
            >
              Browse All Plugins
            </Link>
            <Link
              href="/profiles"
              className="cursor-pointer rounded-lg border border-[#2a2a2e] bg-[#141416] px-5 py-2.5 text-sm font-medium text-gray-200 transition-all duration-200 hover:border-violet-500/40 hover:bg-[#1a1a1e]"
            >
              Explore Profiles
            </Link>
          </div>
        </div>
      </section>

      {/* ── Stats Bar ─────────────────────────────────────────────── */}
      <section className="border-y border-[#1e1e22] bg-[#0e0e10]">
        <div className="mx-auto max-w-5xl px-6 py-5">
          <StatsBar
            pluginCount={pluginCount}
            totalInstalls={totalInstalls}
            categoryCount={CATEGORIES.length}
          />
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-6">
        {/* ── Trending ──────────────────────────────────────────────── */}
        {trending.length > 0 && (
          <section className="py-20">
            <div className="mb-8 flex items-center justify-between">
              <h2 className="font-display text-2xl font-bold">Trending</h2>
              <Link
                href="/plugins?sort=installs"
                className="cursor-pointer text-sm text-violet-400 transition-colors duration-200 hover:text-violet-300"
              >
                View all →
              </Link>
            </div>

            {/* Top 2 featured */}
            <div className="grid gap-3 sm:grid-cols-2">
              {trending.slice(0, 2).map((c) => (
                <PluginCardFeatured key={c.id} component={c} />
              ))}
            </div>

            {/* Remaining */}
            {trending.length > 2 && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {trending.slice(2).map((c) => (
                  <PluginCard key={c.id} component={c} />
                ))}
              </div>
            )}
          </section>
        )}

        {/* ── Categories ────────────────────────────────────────────── */}
        <section className={trending.length > 0 ? "border-t border-[#1e1e22] py-20" : "py-20"}>
          <div className="mb-10 text-center">
            <h2 className="font-display mb-2 text-2xl font-bold">Browse by category</h2>
            <p className="text-sm text-gray-400">Find the right plugin for your workflow</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {CATEGORIES.map((cat) => (
              <Link
                key={cat.slug}
                href={`/plugins?category=${cat.slug}`}
                className="group flex cursor-pointer items-start gap-4 rounded-xl border border-[#2a2a2e] bg-[#141416] p-5 transition-all duration-300 hover:border-violet-500/30 hover:shadow-lg hover:shadow-violet-500/5"
              >
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-400 transition-colors duration-200 group-hover:bg-violet-500/20">
                  <CategoryIcon slug={cat.slug} />
                </div>
                <div>
                  <h3 className="font-display font-semibold text-gray-100 transition-colors duration-200 group-hover:text-violet-400">
                    {cat.name}
                  </h3>
                  <p className="mt-1 text-sm text-gray-400">{cat.description}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* ── How it works ──────────────────────────────────────────── */}
        <section className="border-t border-[#1e1e22] py-20">
          <div className="mb-12 text-center">
            <h2 className="font-display mb-2 text-2xl font-bold">How it works</h2>
            <p className="text-sm text-gray-400">Three steps to extend your Claude Code setup</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {/* Step 1 */}
            <div className="rounded-xl border border-[#2a2a2e] bg-[#141416] p-6 transition-all duration-300 hover:border-violet-500/20 hover:shadow-lg hover:shadow-violet-500/5">
              <div className="mb-4 flex size-10 items-center justify-center rounded-lg bg-violet-500/10 text-violet-400">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  width={20}
                  height={20}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="4 17 10 11 4 5" />
                  <line x1="12" y1="19" x2="20" y2="19" />
                </svg>
              </div>
              <div className="mb-1 text-xs font-medium text-violet-400">Step 1</div>
              <h3 className="font-display mb-2 font-semibold text-gray-100">
                Browse the marketplace
              </h3>
              <p className="text-sm leading-relaxed text-gray-400">
                Search by name, category, or use case. Every plugin is open source and ready to
                install.
              </p>
            </div>

            {/* Step 2 */}
            <div className="rounded-xl border border-[#2a2a2e] bg-[#141416] p-6 transition-all duration-300 hover:border-violet-500/20 hover:shadow-lg hover:shadow-violet-500/5">
              <div className="mb-4 flex size-10 items-center justify-center rounded-lg bg-violet-500/10 text-violet-400">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  width={20}
                  height={20}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </div>
              <div className="mb-1 text-xs font-medium text-violet-400">Step 2</div>
              <h3 className="font-display mb-2 font-semibold text-gray-100">Install by name</h3>
              <p className="text-sm leading-relaxed text-gray-400">
                Run{" "}
                <code className="rounded bg-[#1a1a1e] px-1.5 py-0.5 font-mono text-xs text-gray-300">
                  /plugin install research@harness-kit
                </code>{" "}
                — one command, no config files to edit.
              </p>
            </div>

            {/* Step 3 */}
            <div className="rounded-xl border border-[#2a2a2e] bg-[#141416] p-6 transition-all duration-300 hover:border-violet-500/20 hover:shadow-lg hover:shadow-violet-500/5">
              <div className="mb-4 flex size-10 items-center justify-center rounded-lg bg-violet-500/10 text-violet-400">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  width={20}
                  height={20}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="m13 2-3 6.5H4l6 4.5-2.5 7L13 16l5.5 4-2.5-7 6-4.5h-6z" />
                </svg>
              </div>
              <div className="mb-1 text-xs font-medium text-violet-400">Step 3</div>
              <h3 className="font-display mb-2 font-semibold text-gray-100">Start using it</h3>
              <p className="text-sm leading-relaxed text-gray-400">
                Invoke your new skill with a slash command. It&apos;s ready immediately — no restart
                required.
              </p>
            </div>
          </div>

          <p className="mt-10 text-center text-sm text-gray-500">
            Part of the{" "}
            <a
              href="https://harnessprotocol.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="cursor-pointer text-gray-400 transition-colors duration-200 hover:text-gray-300"
            >
              Harness Protocol
            </a>{" "}
            — a harness-agnostic framework for AI coding tools.
          </p>
        </section>
      </div>
    </div>
  );
}
