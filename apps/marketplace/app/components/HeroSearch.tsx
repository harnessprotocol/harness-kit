"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function HeroSearch() {
  const [query, setQuery] = useState("");
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    router.push(q ? `/plugins?q=${encodeURIComponent(q)}` : "/plugins");
  }

  return (
    <form
      action="/plugins"
      method="GET"
      onSubmit={handleSubmit}
      className="relative mx-auto max-w-xl"
    >
      <label htmlFor="hero-search" className="sr-only">
        Search plugins
      </label>
      <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          width={18}
          height={18}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </div>
      <input
        id="hero-search"
        name="q"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search plugins, skills, agents..."
        className="w-full rounded-xl border border-[#2a2a2e] bg-[#141416] py-3.5 pl-12 pr-4 text-base text-gray-100 placeholder-gray-500 outline-none transition-colors duration-200 focus:border-violet-500/50"
        autoComplete="off"
        spellCheck="false"
      />
      <button type="submit" className="sr-only">
        Search
      </button>
    </form>
  );
}
