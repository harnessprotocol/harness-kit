import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";
import { AuthorizationError, requireOrgRole } from "@/lib/orgs";
import { getServiceSupabase } from "@/lib/supabase";

/**
 * POST /api/orgs/[slug]/plugins/[plugin_id]/approve
 * Approve or deny a public marketplace plugin for organization use.
 * Requires admin role.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; plugin_id: string }> },
) {
  try {
    const user = await getServerSession();
    const { slug, plugin_id } = await params;
    const org = await requireOrgRole(slug, user, "admin");
    const supabase = getServiceSupabase();

    // Verify the public marketplace plugin exists
    const { data: plugin, error: pluginError } = await supabase
      .from("components")
      .select("id")
      .eq("id", plugin_id)
      .single();

    if (pluginError) {
      if (pluginError.code === "PGRST116") {
        return NextResponse.json({ error: "Plugin not found" }, { status: 404 });
      }
      return NextResponse.json({ error: pluginError.message }, { status: 500 });
    }

    const body = await request.json();
    const { approved } = body;

    if (typeof approved !== "boolean") {
      return NextResponse.json(
        { error: "Missing or invalid required field: approved (must be boolean)" },
        { status: 400 },
      );
    }

    const approvalData = {
      org_id: org.id,
      component_id: plugin_id,
      status: approved ? "approved" : "denied",
      approved_by: user!.id,
      approved_at: new Date().toISOString(),
    };

    const { data: approval, error: approvalError } = await supabase
      .from("org_plugin_approvals")
      .upsert(approvalData, { onConflict: "org_id,component_id" })
      .select()
      .single();

    if (approvalError) {
      return NextResponse.json({ error: approvalError.message }, { status: 500 });
    }

    return NextResponse.json(approval);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Failed to process plugin approval" }, { status: 500 });
  }
}
