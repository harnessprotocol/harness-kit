import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getServerSession } from "@/lib/auth";
import { requireOrgRole, AuthorizationError } from "@/lib/orgs";

const VALID_TYPES = ["skill", "agent", "hook", "script", "knowledge", "rules"] as const;

/**
 * GET /api/orgs/[slug]/plugins
 * List all plugins for an organization.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const supabase = getServiceSupabase();

    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .select("id")
      .eq("slug", slug)
      .single();

    if (orgError) {
      if (orgError.code === "PGRST116") {
        return NextResponse.json(
          { error: "Organization not found" },
          { status: 404 }
        );
      }
      return NextResponse.json({ error: orgError.message }, { status: 500 });
    }

    const { data: plugins, error: pluginsError } = await supabase
      .from("org_components")
      .select("*")
      .eq("org_id", org.id)
      .order("created_at", { ascending: false });

    if (pluginsError) {
      return NextResponse.json({ error: pluginsError.message }, { status: 500 });
    }

    return NextResponse.json(plugins);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch organization plugins" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/orgs/[slug]/plugins
 * Publish a new plugin to an organization. Requires admin role.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const user = await getServerSession();
    const { slug } = await params;
    const org = await requireOrgRole(slug, user, "admin");
    const supabase = getServiceSupabase();

    const body = await request.json();
    const {
      slug: pluginSlug,
      name,
      type,
      description,
      version,
      author,
      license,
      skill_md,
      readme_md,
      repo_url,
    } = body;

    if (!pluginSlug || !name) {
      return NextResponse.json(
        { error: "Missing required fields: slug, name" },
        { status: 400 }
      );
    }

    const slugPattern = /^@[a-z0-9-]+\/[a-z0-9-]+$/;
    if (!slugPattern.test(pluginSlug)) {
      return NextResponse.json(
        { error: "Invalid slug format. Must be @org-name/plugin-name" },
        { status: 400 }
      );
    }

    const orgNameFromSlug = pluginSlug.split("/")[0].substring(1);
    if (orgNameFromSlug !== slug) {
      return NextResponse.json(
        { error: "Plugin slug must match organization name" },
        { status: 400 }
      );
    }

    if (type && !VALID_TYPES.includes(type)) {
      return NextResponse.json(
        { error: `Invalid type. Must be one of: ${VALID_TYPES.join(", ")}` },
        { status: 400 }
      );
    }

    const { data: existingPlugin } = await supabase
      .from("org_components")
      .select("slug")
      .eq("slug", pluginSlug)
      .single();

    if (existingPlugin) {
      return NextResponse.json(
        { error: "Plugin with this slug already exists" },
        { status: 409 }
      );
    }

    // Issue 4: do not fall back to user.email — email is PII
    const { data: newPlugin, error: insertError } = await supabase
      .from("org_components")
      .insert({
        org_id: org.id,
        slug: pluginSlug,
        name,
        type: type || "skill",
        description: description || "",
        version: version || "0.1.0",
        author: author || { name: user!.user_metadata?.user_name || "Unknown" },
        license: license || "Apache-2.0",
        skill_md,
        readme_md,
        repo_url,
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json(newPlugin, { status: 201 });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: "Failed to publish plugin" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/orgs/[slug]/plugins
 * Update an existing plugin. Requires admin role.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const user = await getServerSession();
    const { slug } = await params;
    const org = await requireOrgRole(slug, user, "admin");
    const supabase = getServiceSupabase();

    const body = await request.json();
    const {
      slug: pluginSlug,
      name,
      type,
      description,
      version,
      author,
      license,
      skill_md,
      readme_md,
      repo_url,
    } = body;

    if (!pluginSlug) {
      return NextResponse.json(
        { error: "Missing required field: slug" },
        { status: 400 }
      );
    }

    // Check plugin exists and belongs to this org
    const { data: existingPlugin } = await supabase
      .from("org_components")
      .select("id, org_id")
      .eq("slug", pluginSlug)
      .eq("org_id", org.id)
      .single();

    if (!existingPlugin) {
      return NextResponse.json(
        { error: "Plugin not found" },
        { status: 404 }
      );
    }

    if (type && !VALID_TYPES.includes(type)) {
      return NextResponse.json(
        { error: `Invalid type. Must be one of: ${VALID_TYPES.join(", ")}` },
        { status: 400 }
      );
    }

    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name;
    if (type !== undefined) updates.type = type;
    if (description !== undefined) updates.description = description;
    if (version !== undefined) updates.version = version;
    if (author !== undefined) updates.author = author;
    if (license !== undefined) updates.license = license;
    if (skill_md !== undefined) updates.skill_md = skill_md;
    if (readme_md !== undefined) updates.readme_md = readme_md;
    if (repo_url !== undefined) updates.repo_url = repo_url;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 }
      );
    }

    // Issue 13: scope update by both slug and org_id
    const { data: updatedPlugin, error: updateError } = await supabase
      .from("org_components")
      .update(updates)
      .eq("slug", pluginSlug)
      .eq("org_id", org.id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json(updatedPlugin);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: "Failed to update plugin" },
      { status: 500 }
    );
  }
}
