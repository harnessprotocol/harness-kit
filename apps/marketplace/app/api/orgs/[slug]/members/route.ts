import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";
import { AuthorizationError, requireOrgRole } from "@/lib/orgs";
import { getServiceSupabase } from "@/lib/supabase";

/**
 * GET /api/orgs/[slug]/members
 * List all members of an organization. Requires authentication.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const user = await getServerSession();
    const { slug } = await params;
    const org = await requireOrgRole(slug, user, "member");
    const supabase = getServiceSupabase();

    const { data: members, error: membersError } = await supabase
      .from("org_members")
      .select("*")
      .eq("org_id", org.id)
      .order("created_at", { ascending: true });

    if (membersError) {
      return NextResponse.json({ error: membersError.message }, { status: 500 });
    }

    return NextResponse.json(members);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Failed to fetch organization members" }, { status: 500 });
  }
}

/**
 * POST /api/orgs/[slug]/members
 * Add a member to an organization. Requires admin role.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const user = await getServerSession();
    const { slug } = await params;
    const org = await requireOrgRole(slug, user, "admin");
    const supabase = getServiceSupabase();

    const body = await request.json();
    const { user_id, role } = body;

    if (!user_id || !role) {
      return NextResponse.json(
        { error: "Missing required fields: user_id, role" },
        { status: 400 },
      );
    }

    if (role !== "admin" && role !== "member") {
      return NextResponse.json(
        { error: "Invalid role. Must be 'admin' or 'member'" },
        { status: 400 },
      );
    }

    const { data: existingMember } = await supabase
      .from("org_members")
      .select("user_id")
      .eq("org_id", org.id)
      .eq("user_id", user_id)
      .single();

    if (existingMember) {
      return NextResponse.json(
        { error: "User is already a member of this organization" },
        { status: 409 },
      );
    }

    const { data: newMember, error: insertError } = await supabase
      .from("org_members")
      .insert({ org_id: org.id, user_id, role })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json(newMember, { status: 201 });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Failed to add organization member" }, { status: 500 });
  }
}

/**
 * PATCH /api/orgs/[slug]/members
 * Update a member's role. Requires admin role.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const user = await getServerSession();
    const { slug } = await params;
    const org = await requireOrgRole(slug, user, "admin");
    const supabase = getServiceSupabase();

    const body = await request.json();
    const { user_id, role } = body;

    if (!user_id || !role) {
      return NextResponse.json(
        { error: "Missing required fields: user_id, role" },
        { status: 400 },
      );
    }

    if (role !== "admin" && role !== "member") {
      return NextResponse.json(
        { error: "Invalid role. Must be 'admin' or 'member'" },
        { status: 400 },
      );
    }

    if (user_id === user!.id) {
      return NextResponse.json({ error: "Cannot change your own role" }, { status: 400 });
    }

    const { data: targetMember } = await supabase
      .from("org_members")
      .select("role")
      .eq("org_id", org.id)
      .eq("user_id", user_id)
      .single();

    if (!targetMember) {
      return NextResponse.json(
        { error: "User is not a member of this organization" },
        { status: 404 },
      );
    }

    const { data: updatedMember, error: updateError } = await supabase
      .from("org_members")
      .update({ role })
      .eq("org_id", org.id)
      .eq("user_id", user_id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json(updatedMember);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Failed to update member role" }, { status: 500 });
  }
}

/**
 * DELETE /api/orgs/[slug]/members
 * Remove a member from an organization. Requires admin role.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const user = await getServerSession();
    const { slug } = await params;
    const org = await requireOrgRole(slug, user, "admin");
    const supabase = getServiceSupabase();

    const { searchParams } = new URL(request.url);
    const user_id = searchParams.get("user_id");

    if (!user_id) {
      return NextResponse.json(
        { error: "Missing required query parameter: user_id" },
        { status: 400 },
      );
    }

    if (user_id === user!.id) {
      return NextResponse.json(
        { error: "Cannot remove yourself from the organization" },
        { status: 400 },
      );
    }

    const { data: targetMember } = await supabase
      .from("org_members")
      .select("user_id")
      .eq("org_id", org.id)
      .eq("user_id", user_id)
      .single();

    if (!targetMember) {
      return NextResponse.json(
        { error: "User is not a member of this organization" },
        { status: 404 },
      );
    }

    const { error: deleteError } = await supabase
      .from("org_members")
      .delete()
      .eq("org_id", org.id)
      .eq("user_id", user_id);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Failed to remove organization member" }, { status: 500 });
  }
}
