import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { getServerSession } from "@/lib/auth";

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase not configured");
  return createClient(url, key);
}

interface ReviewPayload {
  component_slug: string;
  rating: number;
  review_text: string;
  title?: string;
}

export async function POST(request: NextRequest) {
  // Require authentication
  const user = await getServerSession();
  if (!user) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  // Rate limit: 5 reviews per hour per user
  const { allowed, retryAfter } = checkRateLimit(`review:${user.id}`, {
    maxRequests: 5,
    windowMs: 60 * 60 * 1000,
  });
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many reviews submitted. Please try again later." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  const supabase = getServiceSupabase();
  let payload: ReviewPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const { component_slug, rating, review_text, title } = payload;

  // Validate required fields
  if (!component_slug || rating === undefined || !review_text) {
    return NextResponse.json(
      { error: "Missing required fields: component_slug, rating, review_text" },
      { status: 400 },
    );
  }

  // Validate rating range
  if (rating < 1 || rating > 5 || !Number.isInteger(rating)) {
    return NextResponse.json(
      { error: "Rating must be an integer between 1 and 5" },
      { status: 400 },
    );
  }

  // Validate review text length (50–5000 characters)
  if (review_text.length < 50) {
    return NextResponse.json(
      { error: "Review text must be at least 50 characters" },
      { status: 400 },
    );
  }
  if (review_text.length > 5000) {
    return NextResponse.json(
      { error: "Review text must not exceed 5000 characters" },
      { status: 400 },
    );
  }

  // Find the component by slug
  const { data: component, error: componentError } = await supabase
    .from("components")
    .select("id, name")
    .eq("slug", component_slug)
    .single();

  if (componentError || !component) {
    return NextResponse.json(
      { error: `Component with slug "${component_slug}" not found` },
      { status: 404 },
    );
  }

  // Check if user has already reviewed this component
  const { data: existingReview } = await supabase
    .from("reviews")
    .select("id")
    .eq("component_id", component.id)
    .eq("user_id", user.id)
    .single();

  if (existingReview) {
    return NextResponse.json(
      { error: "You have already submitted a review for this component" },
      { status: 409 },
    );
  }

  // Generate title from review text if not provided (first 60 chars)
  const reviewTitle = title || review_text.substring(0, 60).trim() + (review_text.length > 60 ? "..." : "");

  // Get user name from metadata (GitHub username)
  const userName = user.user_metadata?.user_name ||
                   user.user_metadata?.name ||
                   user.email?.split("@")[0] ||
                   "Anonymous";

  // Insert into reviews table
  const { data: review, error: reviewError } = await supabase
    .from("reviews")
    .insert({
      component_id: component.id,
      user_id: user.id,
      user_name: userName,
      rating: rating,
      title: reviewTitle,
      content: review_text,
    })
    .select()
    .single();

  if (reviewError) {
    // PostgreSQL unique violation — race condition where duplicate slipped past the pre-check
    if (reviewError.code === "23505") {
      return NextResponse.json(
        { error: "You have already submitted a review for this component" },
        { status: 409 },
      );
    }
    console.error("Failed to create review:", reviewError.message);
    return NextResponse.json(
      { error: "Failed to create review. Please try again later." },
      { status: 500 },
    );
  }

  // Also insert/update in ratings table for aggregate calculations
  const { error: ratingError } = await supabase
    .from("ratings")
    .upsert({
      component_id: component.id,
      user_id: user.id,
      rating: rating,
    });

  if (ratingError) {
    // Log error but don't fail the request since the review was created
    console.error("Failed to update ratings table:", ratingError);
  }

  return NextResponse.json(
    {
      message: "Review submitted successfully",
      review,
    },
    { status: 201 },
  );
}
