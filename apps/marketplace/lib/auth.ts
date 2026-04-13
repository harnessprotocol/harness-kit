import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/**
 * Creates a Supabase client configured for server-side auth with cookie storage.
 * This client can access the user's session via cookies set by the OAuth callback.
 */
export async function createServerClient(): Promise<SupabaseClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Supabase not configured");
  }

  const cookieStore = await cookies();

  // Get session tokens from cookies
  const accessToken = cookieStore.get("sb-access-token")?.value;
  const refreshToken = cookieStore.get("sb-refresh-token")?.value;

  const client = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  // If we have tokens, set the session
  if (accessToken && refreshToken) {
    await client.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
  }

  return client;
}

/**
 * Gets the current authenticated user's session from server-side context.
 * Returns null if no user is authenticated.
 */
export async function getServerSession(): Promise<User | null> {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user;
  } catch {
    return null;
  }
}

/**
 * Initiates the GitHub OAuth sign-in flow.
 * Returns the OAuth URL to redirect the user to.
 */
export async function signInWithGitHub(redirectTo?: string): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Supabase not configured");
  }

  const supabase = createClient(url, key);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "github",
    options: {
      redirectTo:
        redirectTo ||
        `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3001"}/api/auth/callback`,
    },
  });

  if (error) {
    throw error;
  }

  return data.url;
}

/**
 * Signs out the current user by clearing session cookies.
 */
export async function signOut(): Promise<void> {
  const supabase = await createServerClient();
  await supabase.auth.signOut();

  // Clear session cookies
  const cookieStore = await cookies();
  cookieStore.delete("sb-access-token");
  cookieStore.delete("sb-refresh-token");
}
