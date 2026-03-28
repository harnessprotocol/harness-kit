import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { Profile, TrustTier } from "@/lib/types";

function TrustBadge({ tier }: { tier: TrustTier }) {
  const colors: Record<TrustTier, string> = {
    official: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    verified: "bg-green-500/20 text-green-400 border-green-500/30",
    community: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${colors[tier]}`}
    >
      {tier}
    </span>
  );
}

interface ProfileWithCounts extends Profile {
  component_count?: number;
}

interface SearchParams {
  q?: string;
}

export default async function ProfilesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const query = params.q ?? "";

  let profiles: ProfileWithCounts[] = [];
  try {
    let q = supabase.from("profiles").select("*");

    if (query) {
      q = q.ilike("name", `%${query}%`);
    }

    q = q.order("name", { ascending: true });

    const { data } = await q;
    profiles = (data as ProfileWithCounts[]) ?? [];
  } catch {
    // Supabase not configured yet
  }

  return (
    <div>
      <h1 className="mb-8 text-3xl font-bold">Profiles</h1>

      {/* Search bar */}
      <form method="GET" action="/profiles" className="mb-6">
        <div className="flex gap-3">
          <input
            type="text"
            name="q"
            defaultValue={query}
            placeholder="Search profiles..."
            className="flex-1 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-4 py-2.5 text-sm text-gray-100 placeholder-gray-500 outline-none focus:border-blue-500/50"
          />
          <button
            type="submit"
            className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-500"
          >
            Search
          </button>
        </div>
      </form>

      {/* Profile list */}
      {profiles.length === 0 ? (
        <div className="rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] py-16 text-center">
          <p className="text-gray-400">
            No profiles found. Connect Supabase to load data.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-[#2a2a2a]">
          {profiles.map((profile) => (
            <Link
              key={profile.id}
              href={`/profiles/${profile.slug}`}
              className="group flex items-start gap-4 border-b border-[#2a2a2a] px-5 py-3.5 transition-colors last:border-b-0 hover:bg-[#1a1a1a]"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-semibold text-gray-100 group-hover:text-blue-400">
                    {profile.name}
                  </span>
                  <TrustBadge tier={profile.trust_tier} />
                  {profile.author && (
                    <span className="text-xs text-gray-500">
                      {profile.author.name}
                    </span>
                  )}
                  {profile.component_count !== undefined && (
                    <span className="text-xs text-gray-500">
                      {profile.component_count} plugin
                      {profile.component_count !== 1 ? "s" : ""} included
                    </span>
                  )}
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-gray-400">
                  {profile.description}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
