"use client";

import { useState } from "react";
import type { User } from "@supabase/supabase-js";

interface FlagButtonProps {
  reviewId: string;
  user: User | null;
  flagged: boolean;
}

export function FlagButton({ reviewId, user, flagged }: FlagButtonProps) {
  const [isFlagging, setIsFlagging] = useState(false);
  const [showReasonMenu, setShowReasonMenu] = useState(false);
  const [hasFlagged, setHasFlagged] = useState(flagged);
  const [message, setMessage] = useState<string | null>(null);

  async function handleFlag(reason: string) {
    if (!user) {
      setMessage("Please sign in to flag reviews");
      setTimeout(() => setMessage(null), 3000);
      setShowReasonMenu(false);
      return;
    }

    setIsFlagging(true);
    setShowReasonMenu(false);

    try {
      const response = await fetch("/api/reviews/flag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          review_id: reviewId,
          reason,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.error || "Failed to flag review");
      } else {
        setHasFlagged(true);
        setMessage("Review flagged successfully");
      }
    } catch (error) {
      setMessage("Network error. Please try again.");
    } finally {
      setIsFlagging(false);
      setTimeout(() => setMessage(null), 3000);
    }
  }

  return (
    <div className="relative">
      {/* Flag button */}
      <button
        onClick={() => setShowReasonMenu(!showReasonMenu)}
        disabled={isFlagging || hasFlagged}
        className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-400 disabled:cursor-not-allowed disabled:opacity-50"
        title={hasFlagged ? "Already flagged" : "Flag inappropriate content"}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
          <line x1="4" y1="22" x2="4" y2="15" />
        </svg>
        {hasFlagged ? "Flagged" : "Flag"}
      </button>

      {/* Reason menu dropdown */}
      {showReasonMenu && (
        <>
          {/* Backdrop to close menu */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setShowReasonMenu(false)}
          />

          {/* Menu */}
          <div className="absolute bottom-full right-0 z-20 mb-2 w-48 rounded-lg border border-gray-700 bg-[#1a1a1e] py-2 shadow-xl">
            <div className="px-3 pb-2 text-xs font-semibold text-gray-400">
              Select a reason
            </div>
            {[
              { value: "spam", label: "Spam" },
              { value: "offensive", label: "Offensive" },
              { value: "misleading", label: "Misleading" },
              { value: "other", label: "Other" },
            ].map((reason) => (
              <button
                key={reason.value}
                onClick={() => handleFlag(reason.value)}
                className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-[#222226]"
              >
                {reason.label}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Status message */}
      {message && (
        <div className="absolute bottom-full right-0 mb-2 w-max max-w-xs rounded-lg border border-gray-700 bg-[#1a1a1e] px-3 py-2 text-xs text-gray-300 shadow-lg">
          {message}
        </div>
      )}
    </div>
  );
}
