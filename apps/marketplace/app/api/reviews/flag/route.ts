import { createClient } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase not configured");
  return createClient(url, key);
}

interface FlagPayload {
  review_id: string;
  reason: string;
}

const VALID_REASONS = ["spam", "offensive", "misleading", "other"] as const;

export async function POST(request: NextRequest) {
  // Require authentication
  const user = await getServerSession();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  // Rate limit: 10 flags per hour per user
  const { allowed, retryAfter } = checkRateLimit(`flag:${user.id}`, {
    maxRequests: 10,
    windowMs: 60 * 60 * 1000,
  });
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many flags submitted. Please try again later." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  const supabase = getServiceSupabase();
  let payload: FlagPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { review_id, reason } = payload;

  // Validate required fields
  if (!review_id || !reason) {
    return NextResponse.json(
      { error: "Missing required fields: review_id, reason" },
      { status: 400 },
    );
  }

  // Validate reason is one of the allowed values
  if (!VALID_REASONS.includes(reason as (typeof VALID_REASONS)[number])) {
    return NextResponse.json(
      { error: `Reason must be one of: ${VALID_REASONS.join(", ")}` },
      { status: 400 },
    );
  }

  // Validate review_id is a valid UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(review_id)) {
    return NextResponse.json({ error: "Invalid review_id format" }, { status: 400 });
  }

  // Check if review exists
  const { data: review, error: reviewError } = await supabase
    .from("reviews")
    .select("id, flagged")
    .eq("id", review_id)
    .single();

  if (reviewError || !review) {
    return NextResponse.json({ error: "Review not found" }, { status: 404 });
  }

  // Check if user has already flagged this review
  const { data: existingFlag } = await supabase
    .from("review_flags")
    .select("id")
    .eq("review_id", review_id)
    .eq("user_id", user.id)
    .single();

  if (existingFlag) {
    return NextResponse.json({ error: "You have already flagged this review" }, { status: 409 });
  }

  // Insert flag into review_flags table
  const { data: flag, error: flagError } = await supabase
    .from("review_flags")
    .insert({
      review_id: review_id,
      user_id: user.id,
      reason: reason,
    })
    .select()
    .single();

  if (flagError) {
    return NextResponse.json(
      { error: `Failed to create flag: ${flagError.message}` },
      { status: 500 },
    );
  }

  // Update the review's flagged status to true
  const { error: updateError } = await supabase
    .from("reviews")
    .update({ flagged: true })
    .eq("id", review_id);

  if (updateError) {
    // Log error but don't fail the request since the flag was created
    console.error("Failed to update review flagged status:", updateError);
  }

  return NextResponse.json(
    {
      message: "Review flagged successfully",
      flag,
    },
    { status: 201 },
  );
}
