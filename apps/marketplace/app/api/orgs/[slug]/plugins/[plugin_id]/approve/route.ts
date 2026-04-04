import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getServerSession } from "@/lib/auth";

/**
 * POST /api/orgs/[slug]/plugins/[plugin_id]/approve
 * Approve or deny a public plugin for organization use.
 * Requires authentication and admin role.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; plugin_id: string }> }
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

    const { slug, plugin_id } = await params;
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

    // Verify the plugin exists
    const { data: plugin, error: pluginError } = await supabase
      .from("components")
      .select("id")
      .eq("id", plugin_id)
      .single();

    if (pluginError) {
      if (pluginError.code === "PGRST116") {
        return NextResponse.json(
          { error: "Plugin not found" },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { error: pluginError.message },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { approved } = body;

    // Validate required field
    if (typeof approved !== "boolean") {
      return NextResponse.json(
        { error: "Missing or invalid required field: approved (must be boolean)" },
        { status: 400 }
      );
    }

    // Prepare approval data
    const status = approved ? "approved" : "denied";
    const approvalData = {
      org_id: org.id,
      component_id: plugin_id,
      status,
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    };

    // Upsert approval record (insert or update if exists)
    const { data: approval, error: approvalError } = await supabase
      .from("org_plugin_approvals")
      .upsert(approvalData, {
        onConflict: "org_id,component_id",
      })
      .select()
      .single();

    if (approvalError) {
      return NextResponse.json(
        { error: approvalError.message },
        { status: 500 }
      );
    }

    return NextResponse.json(approval, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to process plugin approval" },
      { status: 500 }
    );
  }
}
