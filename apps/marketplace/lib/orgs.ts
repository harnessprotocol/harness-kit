import { getServiceSupabase } from "@/lib/supabase";
import { type User } from "@supabase/supabase-js";

/**
 * Organization member roles
 */
export type OrgRole = "admin" | "member";

/**
 * Organization member record
 */
export interface OrgMember {
  org_id: string;
  user_id: string;
  role: OrgRole;
  created_at: string;
}

/**
 * Organization record
 */
export interface Organization {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Gets an organization by slug.
 * Returns null if not found.
 */
export async function getOrgBySlug(slug: string): Promise<Organization | null> {
  const supabase = getServiceSupabase();

  const { data, error } = await supabase
    .from("organizations")
    .select("*")
    .eq("slug", slug)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return null;
    }
    throw error;
  }

  return data;
}

/**
 * Gets a user's role in an organization.
 * Returns null if the user is not a member.
 */
export async function getUserOrgRole(
  orgId: string,
  userId: string
): Promise<OrgRole | null> {
  const supabase = getServiceSupabase();

  const { data, error } = await supabase
    .from("org_members")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return null;
    }
    throw error;
  }

  return data.role as OrgRole;
}

/**
 * Checks if a user has a specific role in an organization.
 * Returns true if the user has the specified role or higher.
 * Admin role has higher privileges than member role.
 */
export async function checkOrgRole(
  orgId: string,
  userId: string,
  requiredRole: OrgRole
): Promise<boolean> {
  const userRole = await getUserOrgRole(orgId, userId);

  if (!userRole) {
    return false;
  }

  // Admin can do anything
  if (userRole === "admin") {
    return true;
  }

  // Member can only do member-level actions
  if (requiredRole === "member") {
    return true;
  }

  return false;
}

/**
 * Checks if a user is a member of an organization (any role).
 */
export async function checkOrgMembership(
  orgId: string,
  userId: string
): Promise<boolean> {
  const role = await getUserOrgRole(orgId, userId);
  return role !== null;
}

/**
 * Requires that a user has a specific role in an organization.
 * Throws an error if the user doesn't have the required role.
 * Use this in API routes for authorization checks.
 */
export async function requireOrgRole(
  orgSlug: string,
  user: User | null,
  requiredRole: OrgRole
): Promise<Organization> {
  if (!user) {
    throw new AuthorizationError("Authentication required", 401);
  }

  const org = await getOrgBySlug(orgSlug);
  if (!org) {
    throw new AuthorizationError("Organization not found", 404);
  }

  const hasRole = await checkOrgRole(org.id, user.id, requiredRole);
  if (!hasRole) {
    const roleLabel = requiredRole === "admin" ? "Admin" : "Member";
    throw new AuthorizationError(`${roleLabel} permission required`, 403);
  }

  return org;
}

/**
 * Gets all organizations a user is a member of.
 */
export async function getUserOrganizations(
  userId: string
): Promise<Organization[]> {
  const supabase = getServiceSupabase();

  const { data, error } = await supabase
    .from("org_members")
    .select("org_id, organizations(*)")
    .eq("user_id", userId);

  if (error) {
    throw error;
  }

  return data.map((item: any) => item.organizations);
}

/**
 * Gets all members of an organization with their roles.
 */
export async function getOrgMembers(orgId: string): Promise<OrgMember[]> {
  const supabase = getServiceSupabase();

  const { data, error } = await supabase
    .from("org_members")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Custom error class for authorization errors.
 * Includes HTTP status code for easy API response handling.
 */
export class AuthorizationError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = "AuthorizationError";
  }
}
