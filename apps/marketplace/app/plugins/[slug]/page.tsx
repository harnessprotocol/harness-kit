import Link from "next/link";
import { notFound } from "next/navigation";
import sanitizeHtml from "sanitize-html";
import { supabase } from "@/lib/supabase";
import type { Component, ComponentType, Profile, TrustTier } from "@/lib/types";
import { TrustBadge } from "@/app/components/TrustBadge";
import { SecurityBadge } from "@/app/components/SecurityBadge";
import { PermissionsSummary } from "@/app/components/PermissionsSummary";
import { ReviewForm } from "@/app/components/ReviewForm";
import { ReviewList } from "@/app/components/ReviewList";
import { getServerSession } from "@/lib/auth";
import type { SecurityPermissionsSummary } from "@harness-kit/shared";

/**
 * Allowed tags and attributes for sanitizeHtml.
 * Permits the Tailwind classes emitted by renderMarkdown while blocking all
 * event handlers and javascript: URLs.
 */
const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ["h1", "h2", "h3", "h4", "p", "pre", "code", "strong", "a", "li", "ul"],
  allowedAttributes: {
    "*": ["class"],
    a: ["href", "target", "rel"],
  },
  allowedSchemes: ["http", "https", "mailto"],
};

/**
 * Minimal server-side markdown-to-HTML renderer.
 * Output is sanitized via sanitizeHtml before rendering — community plugins
 * store arbitrary markdown from GitHub repos which is untrusted content.
 */
function renderMarkdown(md: string): string {
  const html = md
    // Fenced code blocks
    .replace(
      /```(\w*)\n([\s\S]*?)```/g,
      '<pre class="overflow-x-auto rounded-lg bg-[#111] p-4 text-sm"><code>$2</code></pre>',
    )
    // Headings
    .replace(
      /^#### (.+)$/gm,
      '<h4 class="mt-6 mb-2 text-base font-semibold">$1</h4>',
    )
    .replace(
      /^### (.+)$/gm,
      '<h3 class="mt-8 mb-3 text-lg font-semibold">$1</h3>',
    )
    .replace(
      /^## (.+)$/gm,
      '<h2 class="mt-10 mb-4 text-xl font-bold">$1</h2>',
    )
    .replace(
      /^# (.+)$/gm,
      '<h1 class="mt-10 mb-4 text-2xl font-bold">$1</h1>',
    )
    // Bold
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    // Inline code
    .replace(
      /`([^`]+)`/g,
      '<code class="rounded bg-[#1a1a1e] px-1.5 py-0.5 text-sm text-violet-300">$1</code>',
    )
    // Links
    .replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" class="text-violet-400 underline hover:text-violet-300" target="_blank" rel="noopener noreferrer">$1</a>',
    )
    // Unordered lists
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc text-gray-300">$1</li>')
    // Wrap loose lines in paragraphs (skip tags)
    .replace(
      /^(?!<[hluop]|<li|<pre|<code|<strong|<a)(.+)$/gm,
      '<p class="mb-3 text-gray-300">$1</p>',
    );

  return html;
}

export default async function PluginDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  let component: Component | null = null;
  let tags: string[] = [];
  let relatedComponents: Component[] = [];
  let includedInProfiles: Profile[] = [];
  let organization: { id: string; slug: string; name: string } | null = null;

  // Get current user session for reviews
  const user = await getServerSession();

  // Check if this is an org-scoped plugin (starts with @)
  const isOrgScoped = slug.startsWith("@");

  try {
    if (isOrgScoped) {
      // Fetch from org_components and join with organization
      const { data } = await supabase
        .from("org_components")
        .select("*, organizations(id, slug, name)")
        .eq("slug", slug)
        .single();

      if (data) {
        // Map org_component to Component interface
        component = {
          id: data.id,
          slug: data.slug,
          name: data.name,
          type: data.type,
          description: data.description,
          trust_tier: "community" as TrustTier, // org plugins are always community tier
          version: data.version,
          author: data.author,
          license: data.license,
          skill_md: data.skill_md,
          readme_md: data.readme_md,
          repo_url: data.repo_url,
          install_count: data.install_count,
          created_at: data.created_at,
          updated_at: data.updated_at,
        };

        // Extract organization data
        organization = data.organizations as { id: string; slug: string; name: string };
      }

      if (component) {
        // Fetch tags for this org component
        const { data: tagRows } = await supabase
          .from("org_component_tags")
          .select("tag_id, tags(slug)")
          .eq("org_component_id", component.id);

        if (tagRows) {
          tags = tagRows
            .map(
              (row: Record<string, unknown>) =>
                (row.tags as { slug: string })?.slug ?? "",
            )
            .filter(Boolean);
        }

        // Fetch related org components (same type, excluding self)
        const { data: related } = await supabase
          .from("org_components")
          .select("*")
          .eq("type", component.type)
          .neq("id", component.id)
          .order("install_count", { ascending: false })
          .limit(5);

        if (related) {
          relatedComponents = related.map((r: Record<string, unknown>) => ({
            id: r.id as string,
            slug: r.slug as string,
            name: r.name as string,
            type: r.type as ComponentType,
            description: r.description as string,
            trust_tier: "community" as TrustTier,
            version: r.version as string,
            author: r.author as { name: string; url?: string },
            license: r.license as string,
            skill_md: r.skill_md as string | null,
            readme_md: r.readme_md as string | null,
            repo_url: r.repo_url as string | null,
            install_count: r.install_count as number,
            created_at: r.created_at as string,
            updated_at: r.updated_at as string,
          }));
        }
      }
    } else {
      // Fetch from regular components table
      const { data } = await supabase
        .from("components")
        .select("*")
        .eq("slug", slug)
        .single();
      component = data as Component | null;

      if (component) {
        // Fetch tags for this component
        const { data: tagRows } = await supabase
          .from("component_tags")
          .select("tag_id, tags(slug)")
          .eq("component_id", component.id);

        if (tagRows) {
          tags = tagRows
            .map(
              (row: Record<string, unknown>) =>
                (row.tags as { slug: string })?.slug ?? "",
            )
            .filter(Boolean);
        }

        // Fetch related components (same type, excluding self)
        const { data: related } = await supabase
          .from("components")
          .select("*")
          .eq("type", component.type)
          .neq("id", component.id)
          .order("install_count", { ascending: false })
          .limit(5);
        relatedComponents = (related as Component[]) ?? [];

        // Fetch profiles that include this component
        const { data: profileRows } = await supabase
          .from("profile_components")
          .select("profile_id, profiles(id, slug, name, description)")
          .eq("component_id", component.id);

        if (profileRows) {
          includedInProfiles = profileRows
            .map(
              (row: Record<string, unknown>) => row.profiles as Profile,
            )
            .filter(Boolean);
        }
      }
    }
  } catch {
    // Supabase not configured yet
  }

  if (!component) {
    notFound();
  }

  const skillHtml = component.skill_md
    ? sanitizeHtml(renderMarkdown(component.skill_md), SANITIZE_OPTIONS)
    : null;
  const readmeHtml = component.readme_md
    ? sanitizeHtml(renderMarkdown(component.readme_md), SANITIZE_OPTIONS)
    : null;

  const updatedDate = component.updated_at
    ? new Date(component.updated_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  // TODO: Replace with actual security data from database (Phase 4)
  // For now, using default/empty permissions until database schema is updated
  const securityPermissions: SecurityPermissionsSummary = {
    network_access: false,
    file_writes: false,
    env_var_reads: [],
    external_urls: [],
    filesystem_patterns: [],
  };

  return (
    <div>
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm text-gray-500">
        <Link href="/plugins" className="hover:text-gray-300">
          Plugins
        </Link>
        <span className="mx-2">/</span>
        <span className="text-gray-300">{component.name}</span>
      </nav>

      <div className="flex flex-col gap-10 lg:flex-row">
        {/* Main column */}
        <div className="min-w-0 flex-1">
          {/* Header */}
          <div className="mb-6">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-bold">{component.name}</h1>
              {organization && (
                <Link
                  href={`/orgs/${organization.slug}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/40 bg-violet-500/10 px-3 py-1 text-xs font-medium text-violet-400 transition-colors hover:border-violet-500/60 hover:bg-violet-500/20"
                >
                  <svg
                    className="h-3.5 w-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                    />
                  </svg>
                  {organization.name}
                </Link>
              )}
              <TrustBadge tier={component.trust_tier} />
              <SecurityBadge status="not-scanned" />
              <span className="rounded-full border border-[#2a2a2e] px-2.5 py-0.5 text-xs capitalize text-gray-400">
                {component.type}
              </span>
            </div>
            <p className="mt-3 text-lg text-gray-400">
              {component.description}
            </p>
          </div>

          {/* Stats bar */}
          <div className="mb-6 flex flex-wrap items-center gap-4 text-sm text-gray-500">
            <span className="inline-flex items-center gap-1">
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              {component.install_count.toLocaleString()} installs
            </span>
            {component.average_rating !== undefined && component.average_rating > 0 && (
              <span className="inline-flex items-center gap-1">
                <svg
                  className="h-3.5 w-3.5"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
                {component.average_rating.toFixed(1)} ({component.review_count})
              </span>
            )}
            <span>v{component.version}</span>
            {component.license && <span>{component.license}</span>}
            {updatedDate && <span>Updated {updatedDate}</span>}
          </div>

          {/* Tags */}
          {tags.length > 0 && (
            <div className="mb-8 flex flex-wrap gap-2">
              {tags.map((tag) => (
                <Link
                  key={tag}
                  href={`/plugins?tag=${tag}`}
                  className="rounded-full border border-[#2a2a2e] px-3 py-1 text-xs text-gray-400 transition-colors hover:border-violet-500/30 hover:text-violet-400"
                >
                  {tag}
                </Link>
              ))}
            </div>
          )}

          {/* Security & Permissions */}
          <section className="mb-10 rounded-lg border border-[#2a2a2e] bg-[#1a1a1e] p-6">
            <h2 className="mb-4 text-lg font-semibold">Security & Permissions</h2>
            <PermissionsSummary permissions={securityPermissions} />
          </section>

          {/* SKILL.md content */}
          {skillHtml && (
            <section className="mb-10">
              <h2 className="mb-4 text-xl font-bold">Skill Definition</h2>
              <div
                className="prose-invert max-w-none rounded-xl border border-[#2a2a2e] bg-[#1a1a1e] p-6"
                dangerouslySetInnerHTML={{ __html: skillHtml }}
              />
            </section>
          )}

          {/* README.md content */}
          {readmeHtml && (
            <section className="mb-10">
              <h2 className="mb-4 text-xl font-bold">Documentation</h2>
              <div
                className="prose-invert max-w-none rounded-xl border border-[#2a2a2e] bg-[#1a1a1e] p-6"
                dangerouslySetInnerHTML={{ __html: readmeHtml }}
              />
            </section>
          )}

          {/* Reviews section */}
          <section className="mb-10">
            <h2 className="mb-6 text-xl font-bold">Reviews</h2>

            {/* Review form */}
            <div className="mb-8">
              <ReviewForm user={user} componentSlug={slug} />
            </div>

            {/* Review list */}
            <ReviewList componentId={component.id} user={user} />
          </section>
        </div>

        {/* Sidebar */}
        <aside className="w-full shrink-0 lg:sticky lg:top-24 lg:w-72 lg:self-start">
          <div className="space-y-5">
            {/* Author card */}
            {component.author && (
              <div className="rounded-xl border border-[#2a2a2e] bg-[#1a1a1e] p-4">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
                  Author
                </h3>
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#2a2a2e] text-sm font-semibold text-gray-300">
                    {component.author.name.charAt(0).toUpperCase()}
                  </div>
                  {component.author.url ? (
                    <a
                      href={component.author.url}
                      className="text-sm font-medium text-violet-400 hover:text-violet-300"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {component.author.name}
                    </a>
                  ) : (
                    <span className="text-sm font-medium text-gray-200">
                      {component.author.name}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* GitHub repo link */}
            {component.repo_url && (
              <a
                href={component.repo_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 rounded-xl border border-[#2a2a2e] bg-[#1a1a1e] px-4 py-3 text-sm font-medium text-gray-200 transition-colors hover:border-violet-500/40 hover:text-violet-400"
              >
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                </svg>
                View on GitHub
              </a>
            )}

            {/* Install command */}
            <div className="rounded-xl border border-[#2a2a2e] bg-[#1a1a1e] p-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
                Install
              </h3>
              <code className="block rounded-lg bg-[#111] px-3 py-2.5 text-sm text-violet-300">
                /plugin install {component.slug}@harness-kit
              </code>
            </div>

            {/* Included in Profiles */}
            {includedInProfiles.length > 0 && (
              <div className="rounded-xl border border-[#2a2a2e] bg-[#1a1a1e] p-4">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
                  Included in Profiles
                </h3>
                <ul className="space-y-2">
                  {includedInProfiles.map((profile) => (
                    <li key={profile.id}>
                      <Link
                        href={`/profiles/${profile.slug}`}
                        className="text-sm text-violet-400 hover:text-violet-300"
                      >
                        {profile.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Related Plugins */}
            {relatedComponents.length > 0 && (
              <div className="rounded-xl border border-[#2a2a2e] bg-[#1a1a1e] p-4">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
                  Related Plugins
                </h3>
                <ul className="space-y-2.5">
                  {relatedComponents.map((related) => (
                    <li key={related.id}>
                      <Link
                        href={`/plugins/${related.slug}`}
                        className="group block"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-200 group-hover:text-violet-400">
                            {related.name}
                          </span>
                          <span className="text-xs text-gray-500">
                            {related.install_count.toLocaleString()}
                          </span>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
