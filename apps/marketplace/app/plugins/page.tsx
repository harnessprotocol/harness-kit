import Link from "next/link";
import { FilterPanel } from "@/app/components/FilterPanel";
import { StarRating } from "@/app/components/StarRating";
import { TrustBadge } from "@/app/components/TrustBadge";
import { supabase } from "@/lib/supabase";
import type { Component } from "@/lib/types";

interface SearchParams {
  q?: string;
  category?: string;
  type?: string;
  trust?: string;
  tag?: string;
  sort?: string;
}

export default async function PluginsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const query = params.q ?? "";
  const selectedCategory = params.category ?? "";
  const selectedType = params.type ?? "";
  const selectedTrust = params.trust ?? "";
  const selectedTag = params.tag ?? "";
  const sortBy = params.sort ?? "installs";

  let components: Component[] = [];
  try {
    let q = supabase.from("components").select(`
        *,
        ratings:ratings(rating)
      `);

    if (query) {
      q = q.ilike("name", `%${query}%`);
    }
    if (selectedType) {
      q = q.eq("type", selectedType);
    }
    if (selectedTrust) {
      q = q.eq("trust_tier", selectedTrust);
    }

    if (sortBy === "recent") {
      q = q.order("updated_at", { ascending: false });
    } else {
      q = q.order("install_count", { ascending: false });
    }

    const { data } = await q;
    let results = (data ?? []).map((item: any) => {
      const ratings = item.ratings || [];
      const average_rating =
        ratings.length > 0
          ? ratings.reduce((sum: number, r: { rating: number }) => sum + r.rating, 0) /
            ratings.length
          : 0;
      const review_count = ratings.length;

      // Remove the ratings array and add computed fields
      const { ratings: _, ...component } = item;
      return {
        ...component,
        average_rating,
        review_count,
      } as Component;
    });

    // Apply category filter via join table
    if (selectedCategory && results.length > 0) {
      const { data: catRow } = await supabase
        .from("categories")
        .select("id")
        .eq("slug", selectedCategory)
        .single();

      if (catRow) {
        const { data: linked } = await supabase
          .from("component_categories")
          .select("component_id")
          .eq("category_id", catRow.id);

        const ids = new Set((linked ?? []).map((r: { component_id: string }) => r.component_id));
        results = results.filter((c) => ids.has(c.id));
      }
    }

    // Apply tag filter via join table
    if (selectedTag && results.length > 0) {
      const { data: tagRow } = await supabase
        .from("tags")
        .select("id")
        .eq("slug", selectedTag)
        .single();

      if (tagRow) {
        const { data: linked } = await supabase
          .from("component_tags")
          .select("component_id")
          .eq("tag_id", tagRow.id);

        const ids = new Set((linked ?? []).map((r: { component_id: string }) => r.component_id));
        results = results.filter((c) => ids.has(c.id));
      }
    }

    components = results;
  } catch {
    // Supabase not configured yet
  }

  function buildUrl(overrides: Record<string, string>) {
    const merged = { ...params, ...overrides };
    const qs = Object.entries(merged)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join("&");
    return `/plugins${qs ? `?${qs}` : ""}`;
  }

  return (
    <div>
      <h1 className="mb-8 text-3xl font-bold">Plugins</h1>

      {/* Search bar */}
      <form method="GET" action="/plugins" className="mb-6">
        <div className="flex gap-3">
          <input
            type="text"
            name="q"
            defaultValue={query}
            placeholder="Search plugins..."
            className="flex-1 rounded-lg border border-[#2a2a2e] bg-[#1a1a1e] px-4 py-2.5 text-sm text-gray-100 placeholder-gray-500 outline-none focus:border-violet-500/50"
          />
          {selectedCategory && <input type="hidden" name="category" value={selectedCategory} />}
          {selectedType && <input type="hidden" name="type" value={selectedType} />}
          {selectedTrust && <input type="hidden" name="trust" value={selectedTrust} />}
          {selectedTag && <input type="hidden" name="tag" value={selectedTag} />}
          <button
            type="submit"
            className="rounded-lg bg-violet-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-violet-500"
          >
            Search
          </button>
        </div>
      </form>

      <div className="flex gap-8">
        {/* Sidebar filters */}
        <FilterPanel
          selectedCategory={selectedCategory}
          selectedType={selectedType}
          selectedTrust={selectedTrust}
          buildUrl={buildUrl}
        />

        {/* Plugin list */}
        <div className="flex-1">
          {/* Sort controls */}
          <div className="mb-4 flex items-center gap-1 text-sm">
            <span className="mr-2 text-gray-500">Sort:</span>
            <Link
              href={buildUrl({ sort: "installs" })}
              className={`rounded-md px-3 py-1 transition-colors ${
                sortBy === "installs"
                  ? "bg-violet-500/20 text-violet-400"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              Installs
            </Link>
            <Link
              href={buildUrl({ sort: "recent" })}
              className={`rounded-md px-3 py-1 transition-colors ${
                sortBy === "recent"
                  ? "bg-violet-500/20 text-violet-400"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              Recent
            </Link>
          </div>

          {components.length === 0 ? (
            <div className="rounded-xl border border-[#2a2a2e] bg-[#1a1a1e] py-16 text-center">
              <p className="text-gray-400">No plugins found. Connect Supabase to load data.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-[#2a2a2e]">
              {components.map((component) => {
                const updatedDate = component.updated_at
                  ? new Date(component.updated_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })
                  : null;

                return (
                  <Link
                    key={component.id}
                    href={`/plugins/${component.slug}`}
                    className="group flex items-start gap-4 border-b border-[#2a2a2e] px-5 py-3.5 transition-colors last:border-b-0 hover:bg-[#1a1a1e]"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="font-semibold text-gray-100 group-hover:text-violet-400">
                          {component.name}
                        </span>
                        {component.average_rating && component.review_count ? (
                          <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
                            <StarRating rating={component.average_rating} />
                            <span>({component.review_count})</span>
                          </span>
                        ) : null}
                        <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                          <svg
                            className="h-3 w-3"
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
                          {component.install_count.toLocaleString()}
                        </span>
                        {component.author && (
                          <span className="text-xs text-gray-500">{component.author.name}</span>
                        )}
                        <TrustBadge tier={component.trust_tier} />
                        <span className="rounded-full border border-[#2a2a2e] px-2 py-0.5 text-xs capitalize text-gray-500">
                          {component.type}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm text-gray-400">
                        {component.description}
                      </p>
                    </div>
                    <div className="hidden shrink-0 pt-1 text-right text-xs text-gray-500 sm:block">
                      <div>v{component.version}</div>
                      {updatedDate && <div className="mt-0.5">{updatedDate}</div>}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
