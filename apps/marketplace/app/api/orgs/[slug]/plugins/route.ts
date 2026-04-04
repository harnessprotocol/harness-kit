import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getServerSession } from "@/lib/auth";

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

    // Get organization
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
      return NextResponse.json(
        { error: orgError.message },
        { status: 500 }
      );
    }

    // Get all plugins for this organization
    const { data: plugins, error: pluginsError } = await supabase
      .from("org_components")
      .select("*")
      .eq("org_id", org.id)
      .order("created_at", { ascending: false });

    if (pluginsError) {
      return NextResponse.json(
        { error: pluginsError.message },
        { status: 500 }
      );
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
 * Publish a new plugin to an organization.
 * Requires authentication and admin role.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    // Check authentication
    const user = await getServerSession();
    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const { slug } = await params;
    const supabase = getServiceSupabase();

    // Get organization
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
      return NextResponse.json(
        { error: orgError.message },
        { status: 500 }
      );
    }

    // Check if user is an admin
    const { data: member } = await supabase
      .from("org_members")
      .select("role")
      .eq("org_id", org.id)
      .eq("user_id", user.id)
      .single();

    if (!member || member.role !== "admin") {
      return NextResponse.json(
        { error: "Admin permission required" },
        { status: 403 }
      );
    }

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

    // Validate required fields
    if (!pluginSlug || !name) {
      return NextResponse.json(
        { error: "Missing required fields: slug, name" },
        { status: 400 }
      );
    }

    // Validate slug format (@org-name/plugin-name)
    const slugPattern = /^@[a-z0-9-]+\/[a-z0-9-]+$/;
    if (!slugPattern.test(pluginSlug)) {
      return NextResponse.json(
        { error: "Invalid slug format. Must be @org-name/plugin-name" },
        { status: 400 }
      );
    }

    // Extract org name from slug and verify it matches
    const orgNameFromSlug = pluginSlug.split("/")[0].substring(1);
    if (orgNameFromSlug !== slug) {
      return NextResponse.json(
        { error: "Plugin slug must match organization name" },
        { status: 400 }
      );
    }

    // Validate type if provided
    const validTypes = ["skill", "agent", "hook", "script", "knowledge", "rules"];
    if (type && !validTypes.includes(type)) {
      return NextResponse.json(
        { error: `Invalid type. Must be one of: ${validTypes.join(", ")}` },
        { status: 400 }
      );
    }

    // Check if plugin with this slug already exists
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

    // Create plugin
    const { data: newPlugin, error: insertError } = await supabase
      .from("org_components")
      .insert({
        org_id: org.id,
        slug: pluginSlug,
        name,
        type: type || "skill",
        description: description || "",
        version: version || "0.1.0",
        author: author || { name: user.user_metadata?.user_name || user.email || "Unknown" },
        license: license || "Apache-2.0",
        skill_md,
        readme_md,
        repo_url,
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json(
        { error: insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json(newPlugin, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to publish plugin" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/orgs/[slug]/plugins
 * Update an existing plugin.
 * Requires authentication and admin role.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    // Check authentication
    const user = await getServerSession();
    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const { slug } = await params;
    const supabase = getServiceSupabase();

    // Get organization
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
      return NextResponse.json(
        { error: orgError.message },
        { status: 500 }
      );
    }

    // Check if user is an admin
    const { data: member } = await supabase
      .from("org_members")
      .select("role")
      .eq("org_id", org.id)
      .eq("user_id", user.id)
      .single();

    if (!member || member.role !== "admin") {
      return NextResponse.json(
        { error: "Admin permission required" },
        { status: 403 }
      );
    }

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

    // Validate required field (slug to identify which plugin to update)
    if (!pluginSlug) {
      return NextResponse.json(
        { error: "Missing required field: slug" },
        { status: 400 }
      );
    }

    // Check if plugin exists and belongs to this org
    const { data: existingPlugin } = await supabase
      .from("org_components")
      .select("id, org_id")
      .eq("slug", pluginSlug)
      .single();

    if (!existingPlugin) {
      return NextResponse.json(
        { error: "Plugin not found" },
        { status: 404 }
      );
    }

    if (existingPlugin.org_id !== org.id) {
      return NextResponse.json(
        { error: "Plugin does not belong to this organization" },
        { status: 403 }
      );
    }

    // Validate type if provided
    const validTypes = ["skill", "agent", "hook", "script", "knowledge", "rules"];
    if (type && !validTypes.includes(type)) {
      return NextResponse.json(
        { error: `Invalid type. Must be one of: ${validTypes.join(", ")}` },
        { status: 400 }
      );
    }

    // Build update object with only provided fields
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

    // Update plugin
    const { data: updatedPlugin, error: updateError } = await supabase
      .from("org_components")
      .update(updates)
      .eq("slug", pluginSlug)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json(updatedPlugin);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to update plugin" },
      { status: 500 }
    );
  }
}
