import Link from "next/link";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type {
  Organization,
  OrgPluginApproval,
  Component,
} from "@harness-kit/shared";

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

interface PluginApprovalWithComponent extends OrgPluginApproval {
  components: Component;
}

export default async function OrgSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  let organization: Organization | null = null;
  let members: OrgMemberWithUser[] = [];
  let pluginApprovals: PluginApprovalWithComponent[] = [];

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

      // Fetch plugin approvals with component details
      const { data: approvalData } = await supabase
        .from("org_plugin_approvals")
        .select(
          `
          *,
          components(*)
        `,
        )
        .eq("org_id", organization.id)
        .order("created_at", { ascending: false });

      if (approvalData) {
        pluginApprovals =
          approvalData as unknown as PluginApprovalWithComponent[];
      }
    }
  } catch {
    // Supabase not configured yet
  }

  if (!organization) {
    notFound();
  }

  const pendingApprovals = pluginApprovals.filter(
    (a) => a.status === "pending",
  );
  const approvedPlugins = pluginApprovals.filter(
    (a) => a.status === "approved",
  );
  const deniedPlugins = pluginApprovals.filter((a) => a.status === "denied");

  return (
    <div>
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm text-gray-500">
        <Link href="/orgs" className="hover:text-gray-300">
          Organizations
        </Link>
        <span className="mx-2">/</span>
        <Link
          href={`/orgs/${organization.slug}`}
          className="hover:text-gray-300"
        >
          {organization.name}
        </Link>
        <span className="mx-2">/</span>
        <span className="text-gray-300">Settings</span>
      </nav>

      <div className="flex flex-col gap-10 lg:flex-row">
        {/* Main column */}
        <div className="min-w-0 flex-1">
          {/* Header */}
          <div className="mb-6">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-bold">Organization Settings</h1>
              <span className="rounded-full border border-[#2a2a2e] px-2.5 py-0.5 text-xs text-gray-400">
                {organization.name}
              </span>
            </div>
            <p className="mt-3 text-lg text-gray-400">
              Manage members, roles, and plugin approvals for your organization
            </p>
          </div>

          {/* Members management section */}
          <section className="mb-10">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold">Members</h2>
              <button
                disabled
                title="Member invitations coming soon"
                className="cursor-not-allowed rounded-lg border border-violet-500/30 bg-violet-500/10 px-4 py-2 text-sm font-medium text-violet-400 opacity-50"
              >
                Invite Member
              </button>
            </div>
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
                            {member.users.email} · Joined {joinedDate}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <select
                          disabled
                          title="Role changes coming soon"
                          className="cursor-not-allowed rounded-lg border border-[#2a2a2e] bg-[#1a1a1e] px-3 py-1.5 text-sm text-gray-300 opacity-50 focus:outline-none"
                          defaultValue={member.role}
                        >
                          <option value="member">Member</option>
                          <option value="admin">Admin</option>
                        </select>
                        <button
                          disabled
                          title="Member removal coming soon"
                          className="cursor-not-allowed rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-sm text-red-400 opacity-50"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Plugin approvals section */}
          <section className="mb-10">
            <h2 className="mb-4 text-xl font-bold">Plugin Approvals</h2>

            {/* Pending approvals */}
            <div className="mb-6">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-400">
                Pending Approval ({pendingApprovals.length})
              </h3>
              {pendingApprovals.length === 0 ? (
                <div className="rounded-xl border border-[#2a2a2e] bg-[#1a1a1e] p-4 text-center text-sm text-gray-400">
                  No pending approvals
                </div>
              ) : (
                <div className="space-y-3">
                  {pendingApprovals.map((approval) => {
                    const plugin = approval.components;
                    const requestedDate = new Date(
                      approval.created_at,
                    ).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    });

                    return (
                      <div
                        key={approval.id}
                        className="rounded-xl border border-[#2a2a2e] bg-[#1a1a1e] p-4"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="font-semibold text-gray-100">
                                {plugin.name}
                              </h4>
                              <span className="rounded-full border border-[#2a2a2e] px-2 py-0.5 text-xs capitalize text-gray-400">
                                {plugin.type}
                              </span>
                              <span className="rounded-full bg-yellow-500/20 px-2 py-0.5 text-xs text-yellow-400">
                                Pending
                              </span>
                            </div>
                            <p className="mt-1 text-sm text-gray-400">
                              {plugin.description}
                            </p>
                            <div className="mt-2 text-xs text-gray-500">
                              Requested {requestedDate} · v{plugin.version}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button
                              disabled
                              title="Plugin approvals coming soon"
                              className="cursor-not-allowed rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-1.5 text-sm text-green-400 opacity-50"
                            >
                              Approve
                            </button>
                            <button
                              disabled
                              title="Plugin approvals coming soon"
                              className="cursor-not-allowed rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-sm text-red-400 opacity-50"
                            >
                              Deny
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Approved plugins */}
            <div className="mb-6">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-400">
                Approved ({approvedPlugins.length})
              </h3>
              {approvedPlugins.length === 0 ? (
                <div className="rounded-xl border border-[#2a2a2e] bg-[#1a1a1e] p-4 text-center text-sm text-gray-400">
                  No approved plugins
                </div>
              ) : (
                <div className="space-y-3">
                  {approvedPlugins.map((approval) => {
                    const plugin = approval.components;
                    const approvedDate = approval.approved_at
                      ? new Date(approval.approved_at).toLocaleDateString(
                          "en-US",
                          {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          },
                        )
                      : null;

                    return (
                      <div
                        key={approval.id}
                        className="rounded-xl border border-[#2a2a2e] bg-[#1a1a1e] p-4"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="font-semibold text-gray-100">
                                {plugin.name}
                              </h4>
                              <span className="rounded-full border border-[#2a2a2e] px-2 py-0.5 text-xs capitalize text-gray-400">
                                {plugin.type}
                              </span>
                              <span className="rounded-full bg-green-500/20 px-2 py-0.5 text-xs text-green-400">
                                Approved
                              </span>
                            </div>
                            <p className="mt-1 text-sm text-gray-400">
                              {plugin.description}
                            </p>
                            <div className="mt-2 text-xs text-gray-500">
                              {approvedDate && `Approved ${approvedDate} · `}v
                              {plugin.version}
                            </div>
                          </div>
                          <button
                            disabled
                            title="Plugin approvals coming soon"
                            className="cursor-not-allowed rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-sm text-red-400 opacity-50"
                          >
                            Revoke
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Denied plugins */}
            {deniedPlugins.length > 0 && (
              <div className="mb-6">
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-400">
                  Denied ({deniedPlugins.length})
                </h3>
                <div className="space-y-3">
                  {deniedPlugins.map((approval) => {
                    const plugin = approval.components;

                    return (
                      <div
                        key={approval.id}
                        className="rounded-xl border border-[#2a2a2e] bg-[#1a1a1e] p-4"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="font-semibold text-gray-100">
                                {plugin.name}
                              </h4>
                              <span className="rounded-full border border-[#2a2a2e] px-2 py-0.5 text-xs capitalize text-gray-400">
                                {plugin.type}
                              </span>
                              <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-xs text-red-400">
                                Denied
                              </span>
                            </div>
                            <p className="mt-1 text-sm text-gray-400">
                              {plugin.description}
                            </p>
                            <div className="mt-2 text-xs text-gray-500">
                              v{plugin.version}
                            </div>
                          </div>
                          <button
                            disabled
                            title="Plugin approvals coming soon"
                            className="cursor-not-allowed rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-1.5 text-sm text-green-400 opacity-50"
                          >
                            Approve
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        </div>

        {/* Sidebar */}
        <aside className="w-full shrink-0 lg:sticky lg:top-24 lg:w-72 lg:self-start">
          <div className="space-y-5">
            {/* Quick stats card */}
            <div className="rounded-xl border border-[#2a2a2e] bg-[#1a1a1e] p-4">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
                Quick Stats
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Total Members</span>
                  <span className="font-medium text-gray-200">
                    {members.length}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Admins</span>
                  <span className="font-medium text-gray-200">
                    {members.filter((m) => m.role === "admin").length}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Pending Approvals</span>
                  <span className="font-medium text-yellow-400">
                    {pendingApprovals.length}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Approved Plugins</span>
                  <span className="font-medium text-green-400">
                    {approvedPlugins.length}
                  </span>
                </div>
              </div>
            </div>

            {/* Navigation card */}
            <div className="rounded-xl border border-[#2a2a2e] bg-[#1a1a1e] p-4">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
                Navigation
              </h3>
              <div className="space-y-1">
                <Link
                  href={`/orgs/${organization.slug}`}
                  className="block rounded-lg px-3 py-2 text-sm text-gray-300 transition-colors hover:bg-[#2a2a2e]"
                >
                  Overview
                </Link>
                <div className="block rounded-lg bg-violet-500/10 px-3 py-2 text-sm text-violet-400">
                  Settings
                </div>
              </div>
            </div>

            {/* Organization info card */}
            <div className="rounded-xl border border-[#2a2a2e] bg-[#1a1a1e] p-4">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
                Organization
              </h3>
              <div className="space-y-2 text-sm">
                <div>
                  <div className="text-gray-500">Name</div>
                  <div className="font-medium text-gray-200">
                    {organization.name}
                  </div>
                </div>
                <div>
                  <div className="text-gray-500">Slug</div>
                  <div className="font-mono text-xs text-gray-300">
                    {organization.slug}
                  </div>
                </div>
                <div>
                  <div className="text-gray-500">Created</div>
                  <div className="text-gray-200">
                    {new Date(organization.created_at).toLocaleDateString(
                      "en-US",
                      {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      },
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
