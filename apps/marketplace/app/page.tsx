import Link from "next/link";
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
];

function TrustBadge({ tier }: { tier: string }) {
  const colors: Record<string, string> = {
    official: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    verified: "bg-green-500/20 text-green-400 border-green-500/30",
    community: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${colors[tier] ?? colors.community}`}
    >
      {tier}
    </span>
  );
}

function PluginRow({ component }: { component: Component }) {
  const updatedDate = component.updated_at
    ? new Date(component.updated_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <Link
      href={`/plugins/${component.slug}`}
      className="group flex items-center gap-4 border-b border-[#2a2a2a] px-4 py-3 transition-colors hover:bg-[#1a1a1a]"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-gray-100 group-hover:text-blue-400">
            {component.name}
          </span>
          <TrustBadge tier={component.trust_tier} />
          <span className="text-xs text-gray-500">
            {component.install_count.toLocaleString()} installs
          </span>
        </div>
        <p className="mt-0.5 truncate text-sm text-gray-400">
          {component.description}
        </p>
      </div>
      <div className="hidden shrink-0 text-right text-xs text-gray-500 sm:block">
        <div>v{component.version}</div>
        {updatedDate && <div className="mt-0.5">{updatedDate}</div>}
      </div>
    </Link>
  );
}

export default async function HomePage() {
  let trending: Component[] = [];
  try {
    const { data } = await supabase
      .from("components")
      .select("*")
      .order("install_count", { ascending: false })
      .limit(6);
    trending = (data as Component[]) ?? [];
  } catch {
    // Supabase not configured yet — render with empty data
  }

  return (
    <div className="space-y-20">
      {/* Hero */}
      <section className="pt-8 text-center">
        <h1 className="text-5xl font-bold tracking-tight">
          Harness Kit Marketplace
        </h1>
        <p className="mt-4 text-lg text-gray-400">
          Skills, agents, and configuration for Claude Code
        </p>

        <div className="mx-auto mt-10 grid max-w-2xl gap-4 sm:grid-cols-2">
          <Link
            href="/plugins"
            className="group rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] p-6 text-left transition-colors hover:border-blue-500/40"
          >
            <h2 className="text-lg font-semibold group-hover:text-blue-400">
              Browse Plugins
            </h2>
            <p className="mt-1 text-sm text-gray-400">
              Discover skills, agents, hooks, and more
            </p>
          </Link>
          <Link
            href="/profiles"
            className="group rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] p-6 text-left transition-colors hover:border-blue-500/40"
          >
            <h2 className="text-lg font-semibold group-hover:text-blue-400">
              Explore Profiles
            </h2>
            <p className="mt-1 text-sm text-gray-400">
              Pre-configured setups for your role
            </p>
          </Link>
        </div>
      </section>

      {/* Trending Plugins */}
      {trending.length > 0 && (
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-2xl font-bold">Trending Plugins</h2>
            <Link
              href="/plugins"
              className="text-sm text-blue-400 hover:text-blue-300"
            >
              View all
            </Link>
          </div>
          <div className="rounded-xl border border-[#2a2a2a]">
            {trending.map((c) => (
              <PluginRow key={c.id} component={c} />
            ))}
          </div>
        </section>
      )}

      {/* Featured Categories */}
      <section>
        <h2 className="mb-6 text-2xl font-bold">Featured Categories</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CATEGORIES.map((cat) => (
            <Link
              key={cat.slug}
              href={`/plugins?category=${cat.slug}`}
              className="group rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] p-5 transition-colors hover:border-blue-500/40"
            >
              <h3 className="font-semibold group-hover:text-blue-400">
                {cat.name}
              </h3>
              <p className="mt-1 text-sm text-gray-400">{cat.description}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
