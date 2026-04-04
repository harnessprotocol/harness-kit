import Link from "next/link";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { Organization, OrgComponent } from "@/lib/types";

interface OrgMemberWithUser {
  org_id: string;
  user_id: string;
  role: "admin" | "member";
  created_at: string;
  users: {
    id: string;
    email: string;
    user_metadata?: {
      name?: string;
      avatar_url?: string;
    };
  };
}

export default async function OrgDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  let organization: Organization | null = null;
  let members: OrgMemberWithUser[] = [];
  let orgPlugins: OrgComponent[] = [];

  try {
    // Fetch the organization
    const { data: orgData } = await supabase
      .from("organizations")
      .select("*")
      .eq("slug", slug)
      .single();
    organization = orgData as Organization | null;

    if (organization) {
      // Fetch org members with user details
      const { data: memberRows } = await supabase
        .from("org_members")
        .select(
          `
          org_id,
          user_id,
          role,
          created_at,
          users:auth.users(id, email, raw_user_meta_data)
        `,
        )
        .eq("org_id", organization.id);

      if (memberRows) {
        members = memberRows.map((row: Record<string, unknown>) => ({
          org_id: row.org_id as string,
          user_id: row.user_id as string,
          role: row.role as "admin" | "member",
          created_at: row.created_at as string,
          users: {
            id: (row.users as Record<string, unknown>)?.id as string,
            email: (row.users as Record<string, unknown>)?.email as string,
            user_metadata: (row.users as Record<string, unknown>)
              ?.raw_user_meta_data as { name?: string; avatar_url?: string },
          },
        }));
      }

      // Fetch org plugins
      const { data: pluginData } = await supabase
        .from("org_components")
        .select("*")
        .eq("org_id", organization.id)
        .order("install_count", { ascending: false });

      orgPlugins = (pluginData as OrgComponent[]) ?? [];
    }
  } catch {
    // Supabase not configured yet
  }

  if (!organization) {
    notFound();
  }

  const updatedDate = organization.updated_at
    ? new Date(organization.updated_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <div>
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm text-gray-500">
        <Link href="/orgs" className="hover:text-gray-300">
          Organizations
        </Link>
        <span className="mx-2">/</span>
        <span className="text-gray-300">{organization.name}</span>
      </nav>

      <div className="flex flex-col gap-10 lg:flex-row">
        {/* Main column */}
        <div className="min-w-0 flex-1">
          {/* Header */}
          <div className="mb-6">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-bold">{organization.name}</h1>
              <span className="rounded-full border border-[#2a2a2e] px-2.5 py-0.5 text-xs text-gray-400">
                Organization
              </span>
            </div>
            {organization.description && (
              <p className="mt-3 text-lg text-gray-400">
                {organization.description}
              </p>
            )}
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
                  d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                />
              </svg>
              {members.length} {members.length === 1 ? "member" : "members"}
            </span>
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
                  d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                />
              </svg>
              {orgPlugins.length} {orgPlugins.length === 1 ? "plugin" : "plugins"}
            </span>
            {updatedDate && <span>Updated {updatedDate}</span>}
          </div>

          {/* Members section */}
          <section className="mb-10">
            <h2 className="mb-4 text-xl font-bold">Members</h2>
            {members.length === 0 ? (
              <div className="rounded-xl border border-[#2a2a2e] bg-[#1a1a1e] p-6 text-center text-gray-400">
                No members found
              </div>
            ) : (
              <div className="rounded-xl border border-[#2a2a2e] bg-[#1a1a1e]">
                {members.map((member) => {
                  const displayName =
                    member.users.user_metadata?.name ||
                    member.users.email?.split("@")[0] ||
                    "Unknown";
                  const avatarUrl = member.users.user_metadata?.avatar_url;
                  const joinedDate = new Date(
                    member.created_at,
                  ).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  });

                  return (
                    <div
                      key={member.user_id}
                      className="flex items-center justify-between border-b border-[#2a2a2e] px-5 py-4 last:border-b-0"
                    >
                      <div className="flex items-center gap-3">
                        {avatarUrl ? (
                          <img
                            src={avatarUrl}
                            alt={displayName}
                            className="h-10 w-10 rounded-full bg-[#2a2a2e]"
                          />
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#2a2a2e] text-sm font-semibold text-gray-300">
                            {displayName.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-200">
                              {displayName}
                            </span>
                            {member.role === "admin" && (
                              <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-xs text-violet-400">
                                Admin
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-gray-500">
                            Joined {joinedDate}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Plugins section */}
          <section className="mb-10">
            <h2 className="mb-4 text-xl font-bold">Plugins</h2>
            {orgPlugins.length === 0 ? (
              <div className="rounded-xl border border-[#2a2a2e] bg-[#1a1a1e] p-6 text-center text-gray-400">
                No plugins found
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                {orgPlugins.map((plugin) => {
                  const pluginUpdatedDate = plugin.updated_at
                    ? new Date(plugin.updated_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })
                    : null;

                  return (
                    <div
                      key={plugin.id}
                      className="rounded-xl border border-[#2a2a2e] bg-[#1a1a1e] p-5 transition-colors hover:border-violet-500/30"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-semibold text-gray-100">
                              {plugin.name}
                            </h3>
                            <span className="rounded-full border border-[#2a2a2e] px-2 py-0.5 text-xs capitalize text-gray-400">
                              {plugin.type}
                            </span>
                          </div>
                          <p className="mt-2 line-clamp-2 text-sm text-gray-400">
                            {plugin.description}
                          </p>
                          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-gray-500">
                            <span className="inline-flex items-center gap-1">
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
                              {plugin.install_count.toLocaleString()}
                            </span>
                            <span>v{plugin.version}</span>
                            {pluginUpdatedDate && (
                              <span>Updated {pluginUpdatedDate}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* Sidebar */}
        <aside className="w-full shrink-0 lg:sticky lg:top-24 lg:w-72 lg:self-start">
          <div className="space-y-5">
            {/* Organization info card */}
            <div className="rounded-xl border border-[#2a2a2e] bg-[#1a1a1e] p-4">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
                Organization
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Members</span>
                  <span className="font-medium text-gray-200">
                    {members.length}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Plugins</span>
                  <span className="font-medium text-gray-200">
                    {orgPlugins.length}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Created</span>
                  <span className="font-medium text-gray-200">
                    {new Date(organization.created_at).toLocaleDateString(
                      "en-US",
                      {
                        month: "short",
                        year: "numeric",
                      },
                    )}
                  </span>
                </div>
              </div>
            </div>

            {/* Admin members card */}
            {members.filter((m) => m.role === "admin").length > 0 && (
              <div className="rounded-xl border border-[#2a2a2e] bg-[#1a1a1e] p-4">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
                  Admins
                </h3>
                <ul className="space-y-2">
                  {members
                    .filter((m) => m.role === "admin")
                    .map((admin) => {
                      const displayName =
                        admin.users.user_metadata?.name ||
                        admin.users.email?.split("@")[0] ||
                        "Unknown";

                      return (
                        <li key={admin.user_id} className="flex items-center gap-2">
                          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#2a2a2e] text-xs font-semibold text-gray-300">
                            {displayName.charAt(0).toUpperCase()}
                          </div>
                          <span className="text-sm text-gray-200">
                            {displayName}
                          </span>
                        </li>
                      );
                    })}
                </ul>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
