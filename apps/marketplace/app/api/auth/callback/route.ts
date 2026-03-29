import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/**
 * OAuth callback handler for GitHub authentication.
 * Exchanges the authorization code for a session and sets secure cookies.
 */
export async function GET(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return NextResponse.json(
      { error: "Supabase not configured" },
      { status: 503 },
    );
  }

  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const error = requestUrl.searchParams.get("error");
  const errorDescription = requestUrl.searchParams.get("error_description");

  // Handle OAuth errors
  if (error) {
    return NextResponse.redirect(
      new URL(
        `/auth/error?error=${encodeURIComponent(error)}&description=${encodeURIComponent(errorDescription || "")}`,
        requestUrl.origin,
      ),
    );
  }

  if (!code) {
    return NextResponse.json(
      { error: "Missing authorization code" },
      { status: 400 },
    );
  }

  const supabase = createClient(url, key);

  // Exchange code for session
  const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError || !data.session) {
    return NextResponse.redirect(
      new URL(
        `/auth/error?error=exchange_failed&description=${encodeURIComponent(exchangeError?.message || "Failed to exchange code for session")}`,
        requestUrl.origin,
      ),
    );
  }

  // Set session cookies
  const cookieStore = await cookies();

  // Set secure, httpOnly cookies for session tokens
  cookieStore.set("sb-access-token", data.session.access_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" || process.env.VERCEL === "1",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: "/",
  });

  cookieStore.set("sb-refresh-token", data.session.refresh_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" || process.env.VERCEL === "1",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: "/",
  });

  // Redirect to the page the user was on, or home
  const redirectTo = requestUrl.searchParams.get("redirect_to") || "/plugins";
  return NextResponse.redirect(new URL(redirectTo, requestUrl.origin));
}
