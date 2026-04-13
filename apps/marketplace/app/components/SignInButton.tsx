"use client";

import type { User } from "@supabase/supabase-js";
import { useState } from "react";

interface SignInButtonProps {
  user: User | null;
}

export function SignInButton({ user }: SignInButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  async function handleSignIn() {
    setIsLoading(true);
    try {
      const response = await fetch("/api/auth/signin", { method: "POST" });
      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      setIsLoading(false);
    }
  }

  async function handleSignOut() {
    setIsLoading(true);
    try {
      await fetch("/api/auth/signout", { method: "POST" });
      window.location.reload();
    } catch {
      setIsLoading(false);
    }
  }

  if (user) {
    return (
      <div className="flex items-center gap-3">
        {user.user_metadata?.avatar_url && (
          <img
            src={user.user_metadata.avatar_url}
            alt={user.user_metadata?.user_name || "User"}
            className="h-8 w-8 rounded-full border border-gray-700"
          />
        )}
        <span className="text-sm text-gray-300">{user.user_metadata?.user_name || user.email}</span>
        <button
          onClick={handleSignOut}
          disabled={isLoading}
          className="rounded-lg border border-gray-700 bg-[#1a1a1e] px-4 py-2 text-sm text-gray-300 transition-colors duration-200 hover:border-gray-600 hover:bg-[#222226] disabled:opacity-50"
        >
          {isLoading ? "Signing out..." : "Sign out"}
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={handleSignIn}
      disabled={isLoading}
      className="inline-flex items-center gap-2 rounded-lg border border-gray-700 bg-[#1a1a1e] px-4 py-2 text-sm text-gray-100 transition-colors duration-200 hover:border-gray-600 hover:bg-[#222226] disabled:opacity-50"
    >
      <svg viewBox="0 0 24 24" width={18} height={18} fill="currentColor" aria-hidden="true">
        <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
      </svg>
      {isLoading ? "Signing in..." : "Sign in with GitHub"}
    </button>
  );
}
