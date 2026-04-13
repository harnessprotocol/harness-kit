import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { Organization } from "@/lib/types";

interface SearchParams {
  q?: string;
  sort?: string;
}

export default async function OrgsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const query = params.q ?? "";
  const sortBy = params.sort ?? "name";

  let organizations: Organization[] = [];
  try {
    let q = supabase.from("organizations").select("*");

    if (query) {
      q = q.ilike("name", `%${query}%`);
    }

    if (sortBy === "recent") {
      q = q.order("updated_at", { ascending: false });
    } else {
      q = q.order("name", { ascending: true });
    }

    const { data } = await q;
    organizations = data ?? [];
  } catch {
    // Supabase not configured yet
  }

  function buildUrl(overrides: Record<string, string>) {
    const merged = { ...params, ...overrides };
    const qs = Object.entries(merged)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join("&");
    return `/orgs${qs ? `?${qs}` : ""}`;
  }

  return (
    <div>
      <h1 className="mb-8 text-3xl font-bold">Organizations</h1>

      {/* Search bar */}
      <form method="GET" action="/orgs" className="mb-6">
        <div className="flex gap-3">
          <input
            type="text"
            name="q"
            defaultValue={query}
            placeholder="Search organizations..."
            className="flex-1 rounded-lg border border-[#2a2a2e] bg-[#1a1a1e] px-4 py-2.5 text-sm text-gray-100 placeholder-gray-500 outline-none focus:border-violet-500/50"
          />
          <button
            type="submit"
            className="rounded-lg bg-violet-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-violet-500"
          >
            Search
          </button>
        </div>
      </form>

      <div className="flex gap-8">
        {/* Main content */}
        <div className="flex-1">
          {/* Sort controls */}
          <div className="mb-4 flex items-center gap-1 text-sm">
            <span className="mr-2 text-gray-500">Sort:</span>
            <Link
              href={buildUrl({ sort: "name" })}
              className={`rounded-md px-3 py-1 transition-colors ${
                sortBy === "name"
                  ? "bg-violet-500/20 text-violet-400"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              Name
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

          {organizations.length === 0 ? (
            <div className="rounded-xl border border-[#2a2a2e] bg-[#1a1a1e] py-16 text-center">
              <p className="text-gray-400">
                No organizations found. Connect Supabase to load data.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-[#2a2a2e]">
              {organizations.map((org) => {
                const updatedDate = org.updated_at
                  ? new Date(org.updated_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })
                  : null;

                return (
                  <Link
                    key={org.id}
                    href={`/orgs/${org.slug}`}
                    className="group flex items-start gap-4 border-b border-[#2a2a2e] px-5 py-3.5 transition-colors last:border-b-0 hover:bg-[#1a1a1e]"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="font-semibold text-gray-100 group-hover:text-violet-400">
                          {org.name}
                        </span>
                      </div>
                      {org.description && (
                        <p className="mt-1 line-clamp-2 text-sm text-gray-400">{org.description}</p>
                      )}
                    </div>
                    <div className="hidden shrink-0 pt-1 text-right text-xs text-gray-500 sm:block">
                      {updatedDate && <div>{updatedDate}</div>}
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
