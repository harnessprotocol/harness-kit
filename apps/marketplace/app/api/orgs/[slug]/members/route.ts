import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getServerSession } from "@/lib/auth";

/**
 * GET /api/orgs/[slug]/members
 * List all members of an organization.
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

    // Get all members
    const { data: members, error: membersError } = await supabase
      .from("org_members")
      .select("*")
      .eq("org_id", org.id)
      .order("created_at", { ascending: true });

    if (membersError) {
      return NextResponse.json(
        { error: membersError.message },
        { status: 500 }
      );
    }

    return NextResponse.json(members);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch organization members" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/orgs/[slug]/members
 * Add a member to an organization.
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
    const { user_id, role } = body;

    // Validate required fields
    if (!user_id || !role) {
      return NextResponse.json(
        { error: "Missing required fields: user_id, role" },
        { status: 400 }
      );
    }

    // Validate role
    if (role !== "admin" && role !== "member") {
      return NextResponse.json(
        { error: "Invalid role. Must be 'admin' or 'member'" },
        { status: 400 }
      );
    }

    // Check if member already exists
    const { data: existingMember } = await supabase
      .from("org_members")
      .select("user_id")
      .eq("org_id", org.id)
      .eq("user_id", user_id)
      .single();

    if (existingMember) {
      return NextResponse.json(
        { error: "User is already a member of this organization" },
        { status: 409 }
      );
    }

    // Add member
    const { data: newMember, error: insertError } = await supabase
      .from("org_members")
      .insert({
        org_id: org.id,
        user_id,
        role,
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json(
        { error: insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json(newMember, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to add organization member" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/orgs/[slug]/members
 * Update a member's role in an organization.
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
    const { user_id, role } = body;

    // Validate required fields
    if (!user_id || !role) {
      return NextResponse.json(
        { error: "Missing required fields: user_id, role" },
        { status: 400 }
      );
    }

    // Validate role
    if (role !== "admin" && role !== "member") {
      return NextResponse.json(
        { error: "Invalid role. Must be 'admin' or 'member'" },
        { status: 400 }
      );
    }

    // Prevent user from changing their own role
    if (user_id === user.id) {
      return NextResponse.json(
        { error: "Cannot change your own role" },
        { status: 400 }
      );
    }

    // Check if target member exists
    const { data: targetMember } = await supabase
      .from("org_members")
      .select("role")
      .eq("org_id", org.id)
      .eq("user_id", user_id)
      .single();

    if (!targetMember) {
      return NextResponse.json(
        { error: "User is not a member of this organization" },
        { status: 404 }
      );
    }

    // Update member role
    const { data: updatedMember, error: updateError } = await supabase
      .from("org_members")
      .update({ role })
      .eq("org_id", org.id)
      .eq("user_id", user_id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json(updatedMember);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to update member role" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/orgs/[slug]/members
 * Remove a member from an organization.
 * Requires authentication and admin role.
 */
export async function DELETE(
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
    const { searchParams } = new URL(request.url);
    const user_id = searchParams.get("user_id");

    if (!user_id) {
      return NextResponse.json(
        { error: "Missing required query parameter: user_id" },
        { status: 400 }
      );
    }

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

    // Prevent user from removing themselves
    if (user_id === user.id) {
      return NextResponse.json(
        { error: "Cannot remove yourself from the organization" },
        { status: 400 }
      );
    }

    // Check if member exists
    const { data: targetMember } = await supabase
      .from("org_members")
      .select("user_id")
      .eq("org_id", org.id)
      .eq("user_id", user_id)
      .single();

    if (!targetMember) {
      return NextResponse.json(
        { error: "User is not a member of this organization" },
        { status: 404 }
      );
    }

    // Remove member
    const { error: deleteError } = await supabase
      .from("org_members")
      .delete()
      .eq("org_id", org.id)
      .eq("user_id", user_id);

    if (deleteError) {
      return NextResponse.json(
        { error: deleteError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to remove organization member" },
      { status: 500 }
    );
  }
}
