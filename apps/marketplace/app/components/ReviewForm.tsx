"use client";

import type { User } from "@supabase/supabase-js";
import { useState } from "react";
import { SignInButton } from "./SignInButton";
import { StarRating } from "./StarRating";

interface ReviewFormProps {
  user: User | null;
  componentSlug: string;
}

export function ReviewForm({ user, componentSlug }: ReviewFormProps) {
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // If not authenticated, show sign-in prompt
  if (!user) {
    return (
      <div className="rounded-lg border border-gray-700 bg-[#1a1a1e] p-6">
        <h3 className="mb-2 text-lg font-semibold text-gray-100">Write a Review</h3>
        <p className="mb-4 text-sm text-gray-400">
          Sign in with GitHub to submit a review for this plugin.
        </p>
        <SignInButton user={null} />
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    // Validate rating
    if (rating === 0) {
      setMessage({ type: "error", text: "Please select a star rating" });
      return;
    }

    // Validate review text length
    if (reviewText.length < 50) {
      setMessage({
        type: "error",
        text: `Review must be at least 50 characters (currently ${reviewText.length})`,
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          component_slug: componentSlug,
          rating,
          review_text: reviewText,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage({ type: "error", text: data.error || "Failed to submit review" });
        return;
      }

      // Success - reset form
      setMessage({ type: "success", text: "Review submitted successfully!" });
      setRating(0);
      setReviewText("");

      // Reload page after short delay to show new review
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (error) {
      setMessage({ type: "error", text: "Network error. Please try again." });
    } finally {
      setIsSubmitting(false);
    }
  }

  const charCount = reviewText.length;
  const minChars = 50;
  const isValid = rating > 0 && charCount >= minChars;

  return (
    <div className="rounded-lg border border-gray-700 bg-[#1a1a1e] p-6">
      <h3 className="mb-4 text-lg font-semibold text-gray-100">Write a Review</h3>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Rating selector */}
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-300">Rating</label>
          <StarRating rating={rating} interactive={true} onChange={setRating} />
        </div>

        {/* Review text */}
        <div>
          <label htmlFor="review-text" className="mb-2 block text-sm font-medium text-gray-300">
            Review
          </label>
          <textarea
            id="review-text"
            value={reviewText}
            onChange={(e) => setReviewText(e.target.value)}
            placeholder="Share your experience with this plugin..."
            rows={6}
            className="w-full rounded-lg border border-gray-700 bg-[#222226] px-3 py-2 text-sm text-gray-100 placeholder-gray-500 transition-colors duration-200 focus:border-gray-600 focus:outline-none focus:ring-1 focus:ring-gray-600"
          />
          <div className="mt-1 flex items-center justify-between">
            <span
              className={`text-xs ${charCount < minChars ? "text-gray-500" : "text-green-500"}`}
            >
              {charCount} / {minChars} characters minimum
            </span>
          </div>
        </div>

        {/* Status message */}
        {message && (
          <div
            className={`rounded-lg border px-4 py-2 text-sm ${
              message.type === "success"
                ? "border-green-700 bg-green-900/20 text-green-400"
                : "border-red-700 bg-red-900/20 text-red-400"
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Submit button */}
        <button
          type="submit"
          disabled={!isValid || isSubmitting}
          className="w-full rounded-lg border border-gray-700 bg-[#222226] px-4 py-2 text-sm font-medium text-gray-100 transition-colors duration-200 hover:border-gray-600 hover:bg-[#2a2a2e] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? "Submitting..." : "Submit Review"}
        </button>
      </form>
    </div>
  );
}
