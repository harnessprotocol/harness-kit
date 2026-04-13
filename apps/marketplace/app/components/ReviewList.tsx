import type { User } from "@supabase/supabase-js";
import sanitizeHtml from "sanitize-html";
import { supabase } from "@/lib/supabase";
import { FlagButton } from "./FlagButton";
import { StarRating } from "./StarRating";

interface Review {
  id: string;
  user_id: string;
  user_name: string;
  rating: number;
  title: string;
  content: string;
  helpful_count: number;
  flagged: boolean;
  created_at: string;
}

interface ReviewListProps {
  componentId: string;
  user: User | null;
}

/**
 * Sanitize options for review content.
 * Allows basic formatting but blocks scripts and event handlers.
 */
const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ["p", "br", "strong", "em", "b", "i"],
  allowedAttributes: {},
  allowedSchemes: [],
};

/**
 * Format a timestamp into a human-readable relative time.
 */
function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes > 1 ? "s" : ""} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return `${weeks} week${weeks > 1 ? "s" : ""} ago`;
  }
  if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    return `${months} month${months > 1 ? "s" : ""} ago`;
  }
  const years = Math.floor(diffDays / 365);
  return `${years} year${years > 1 ? "s" : ""} ago`;
}

export async function ReviewList({ componentId, user }: ReviewListProps) {
  let reviews: Review[] = [];

  try {
    // Fetch reviews for this component, sorted by helpful count and recency
    const { data } = await supabase
      .from("reviews")
      .select("*")
      .eq("component_id", componentId)
      .order("helpful_count", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(50);

    reviews = (data as Review[]) ?? [];
  } catch (error) {
    // Supabase not configured or query failed
    console.error("Failed to fetch reviews:", error);
  }

  // Empty state
  if (reviews.length === 0) {
    return (
      <div className="rounded-lg border border-gray-700 bg-[#1a1a1e] p-8 text-center">
        <p className="text-gray-400">No reviews yet. Be the first to review this plugin!</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {reviews.map((review) => {
        const sanitizedContent = sanitizeHtml(review.content, SANITIZE_OPTIONS).replace(
          /\n/g,
          "<br>",
        );

        // GitHub avatar URL from username
        const avatarUrl = `https://github.com/${review.user_name}.png`;

        return (
          <div key={review.id} className="rounded-lg border border-gray-700 bg-[#1a1a1e] p-6">
            {/* Header: Author info and rating */}
            <div className="mb-3 flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                {/* GitHub avatar */}
                <img
                  src={avatarUrl}
                  alt={review.user_name}
                  className="h-10 w-10 rounded-full border border-gray-700"
                  loading="lazy"
                />
                <div>
                  {/* Author name */}
                  <a
                    href={`https://github.com/${review.user_name}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-gray-100 hover:text-violet-400"
                  >
                    @{review.user_name}
                  </a>
                  {/* Timestamp */}
                  <p className="text-xs text-gray-500">{formatTimestamp(review.created_at)}</p>
                </div>
              </div>

              {/* Star rating */}
              <StarRating rating={review.rating} />
            </div>

            {/* Review title */}
            {review.title && (
              <h4 className="mb-2 text-base font-semibold text-gray-100">{review.title}</h4>
            )}

            {/* Review content */}
            <div
              className="mb-3 text-sm text-gray-300"
              dangerouslySetInnerHTML={{ __html: sanitizedContent }}
            />

            {/* Footer: Helpful count and flag button */}
            <div className="flex items-center justify-between border-t border-gray-700 pt-3">
              <div className="flex items-center gap-4 text-xs text-gray-500">
                {/* Helpful count */}
                {review.helpful_count > 0 && (
                  <span>
                    {review.helpful_count} {review.helpful_count === 1 ? "person" : "people"} found
                    this helpful
                  </span>
                )}
              </div>

              {/* Flag button (client component) */}
              <FlagButton reviewId={review.id} user={user} flagged={review.flagged} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
