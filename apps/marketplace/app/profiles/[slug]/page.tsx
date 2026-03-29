import Link from "next/link";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { Component, Profile } from "@/lib/types";
import { TrustBadge } from "@/app/components/TrustBadge";

export default async function ProfileDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  let profile: Profile | null = null;
  let components: Component[] = [];
  let tags: string[] = [];
  let relatedProfiles: Profile[] = [];

  try {
    // Fetch the profile
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("slug", slug)
      .single();
    profile = data as Profile | null;

    if (profile) {
      // Fetch components in this profile
      const { data: componentRows } = await supabase
        .from("profile_components")
        .select(
          "pinned_version, components(id, slug, name, description, type, trust_tier, version, install_count)",
        )
        .eq("profile_id", profile.id);

      if (componentRows) {
        components = componentRows
          .map(
            (row: Record<string, unknown>) => row.components as Component,
          )
          .filter(Boolean);
      }

      // Fetch tags for this profile
      const { data: tagRows } = await supabase
        .from("profile_tags")
        .select("tag_id, tags(slug)")
        .eq("profile_id", profile.id);

      if (tagRows) {
        tags = tagRows
          .map(
            (row: Record<string, unknown>) =>
              (row.tags as { slug: string })?.slug ?? "",
          )
          .filter(Boolean);
      }

      // Fetch related profiles (excluding self)
      const { data: related } = await supabase
        .from("profiles")
        .select("*")
        .neq("id", profile.id)
        .order("name", { ascending: true })
        .limit(3);
      relatedProfiles = (related as Profile[]) ?? [];
    }
  } catch {
    // Supabase not configured yet
  }

  if (!profile) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-4xl">
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm text-gray-500">
        <Link href="/profiles" className="hover:text-gray-300">
          Profiles
        </Link>
        <span className="mx-2">/</span>
        <span className="text-gray-300">{profile.name}</span>
      </nav>

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold">{profile.name}</h1>
          <TrustBadge tier={profile.trust_tier} />
        </div>
        <p className="mt-3 text-lg text-gray-400">{profile.description}</p>
        {profile.author && (
          <p className="mt-2 text-sm text-gray-500">
            by{" "}
            {profile.author.url ? (
              <a
                href={profile.author.url}
                className="text-violet-400 hover:text-violet-300"
                target="_blank"
                rel="noopener noreferrer"
              >
                {profile.author.name}
              </a>
            ) : (
              profile.author.name
            )}
          </p>
        )}
      </div>

      {/* Tags */}
      {tags.length > 0 && (
        <div className="mb-8 flex flex-wrap gap-2">
          {tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-[#2a2a2e] px-3 py-1 text-xs text-gray-400"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Components in this profile */}
      <section className="mb-10">
        <h2 className="mb-4 text-xl font-bold">
          Plugins ({components.length})
        </h2>
        {components.length === 0 ? (
          <p className="text-sm text-gray-500">
            No plugins listed for this profile yet.
          </p>
        ) : (
          <div className="space-y-3">
            {components.map((component) => (
              <Link
                key={component.id}
                href={`/plugins/${component.slug}`}
                className="group flex items-center justify-between rounded-xl border border-[#2a2a2e] bg-[#1a1a1e] p-4 transition-colors hover:border-violet-500/40"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold group-hover:text-violet-400">
                      {component.name}
                    </h3>
                    <TrustBadge tier={component.trust_tier} />
                    <span className="rounded-full border border-[#2a2a2e] px-2 py-0.5 text-xs capitalize text-gray-500">
                      {component.type}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-gray-400">
                    {component.description}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-gray-500">
                  v{component.version}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* harness.yaml preview */}
      {profile.harness_yaml_template && (
        <section className="mb-10">
          <h2 className="mb-4 text-xl font-bold">harness.yaml</h2>
          <pre className="overflow-x-auto rounded-xl border border-[#2a2a2e] bg-[#111] p-5 text-sm text-gray-300">
            <code>{profile.harness_yaml_template}</code>
          </pre>
        </section>
      )}

      {/* Install Profile */}
      <section className="mb-10 rounded-xl border border-[#2a2a2e] bg-[#1a1a1e] p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-400">
          Install Profile
        </h2>
        <p className="mb-3 text-sm text-gray-400">
          Copy the harness.yaml above into your project, or install components
          individually:
        </p>
        <div className="space-y-2">
          {components.map((component) => (
            <code
              key={component.id}
              className="block rounded-lg bg-[#111] px-4 py-2 text-sm text-violet-300"
            >
              /plugin install {component.slug}@harness-kit
            </code>
          ))}
        </div>
      </section>

      {/* Related Profiles */}
      {relatedProfiles.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-4 text-xl font-bold">Other Profiles</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {relatedProfiles.map((related) => (
              <Link
                key={related.id}
                href={`/profiles/${related.slug}`}
                className="group rounded-xl border border-[#2a2a2e] bg-[#1a1a1e] p-4 transition-colors hover:border-violet-500/40"
              >
                <h3 className="font-semibold group-hover:text-violet-400">
                  {related.name}
                </h3>
                <p className="mt-1 text-sm text-gray-400">
                  {related.description}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
