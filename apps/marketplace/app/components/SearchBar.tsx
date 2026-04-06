"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

interface SearchSuggestion {
  id: string;
  name: string;
  type: string;
  description?: string;
}

interface SearchBarProps {
  /** Initial search query value */
  initialQuery?: string;
  /** Placeholder text for the search input */
  placeholder?: string;
  /** Debounce delay in milliseconds (default: 300) */
  debounceMs?: number;
  /** Minimum characters before showing suggestions (default: 2) */
  minChars?: number;
  /** Maximum number of suggestions to show (default: 5) */
  maxSuggestions?: number;
  /** Custom CSS class for the container */
  className?: string;
  /** Callback when search is submitted */
  onSearch?: (query: string) => void;
}

export function SearchBar({
  initialQuery = "",
  placeholder = "Search plugins, skills, agents...",
  debounceMs = 300,
  minChars = 2,
  maxSuggestions = 5,
  className = "",
  onSearch,
}: SearchBarProps) {
  const [query, setQuery] = useState(initialQuery);
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const router = useRouter();
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch suggestions when query changes (debounced)
  useEffect(() => {
    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Reset suggestions if query is too short
    if (query.trim().length < minChars) {
      setSuggestions([]);
      setShowSuggestions(false);
      setIsLoading(false);
      return;
    }

    // Set loading state immediately
    setIsLoading(true);

    // Debounce the API call
    debounceTimerRef.current = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/search?q=${encodeURIComponent(query)}&limit=${maxSuggestions}`,
        );

        if (response.ok) {
          const data = await response.json();
          const results = data.results || [];
          setSuggestions(results);
          setShowSuggestions(results.length > 0);
        } else {
          setSuggestions([]);
          setShowSuggestions(false);
        }
      } catch (error) {
        setSuggestions([]);
        setShowSuggestions(false);
      } finally {
        setIsLoading(false);
      }
    }, debounceMs);

    // Cleanup timer on unmount or query change
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [query, debounceMs, minChars, maxSuggestions]);

  // Close suggestions when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
        setSelectedIndex(-1);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();

    if (onSearch) {
      onSearch(q);
    } else {
      router.push(q ? `/plugins?q=${encodeURIComponent(q)}` : "/plugins");
    }

    setShowSuggestions(false);
    setSelectedIndex(-1);
  }

  function handleSuggestionClick(suggestion: SearchSuggestion) {
    const suggestionQuery = suggestion.name;
    setQuery(suggestionQuery);
    setShowSuggestions(false);
    setSelectedIndex(-1);

    if (onSearch) {
      onSearch(suggestionQuery);
    } else {
      router.push(`/plugins?q=${encodeURIComponent(suggestionQuery)}`);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!showSuggestions || suggestions.length === 0) {
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev < suggestions.length - 1 ? prev + 1 : prev,
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
        break;
      case "Escape":
        setShowSuggestions(false);
        setSelectedIndex(-1);
        break;
      case "Enter":
        if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
          e.preventDefault();
          handleSuggestionClick(suggestions[selectedIndex]);
        }
        break;
    }
  }

  function getTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      skill: "Skill",
      agent: "Agent",
      hook: "Hook",
      script: "Script",
      plugin: "Plugin",
      knowledge: "Knowledge",
      rules: "Rules",
    };
    return labels[type] || type;
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <form onSubmit={handleSubmit}>
        <label htmlFor="search-bar" className="sr-only">
          Search plugins
        </label>
        <div className="relative">
          <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">
            {isLoading ? (
              <svg
                className="animate-spin"
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
                <circle cx="12" cy="12" r="10" opacity="0.25" />
                <path
                  d="M12 2a10 10 0 0 1 10 10"
                  opacity="0.75"
                  strokeDasharray="31.42"
                  strokeDashoffset="31.42"
                />
              </svg>
            ) : (
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
            )}
          </div>
          <input
            id="search-bar"
            name="q"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              if (suggestions.length > 0) {
                setShowSuggestions(true);
              }
            }}
            placeholder={placeholder}
            className="w-full rounded-xl border border-[#2a2a2e] bg-[#141416] py-3.5 pl-12 pr-4 text-base text-gray-100 placeholder-gray-500 outline-none transition-colors duration-200 focus:border-violet-500/50"
            autoComplete="off"
            spellCheck="false"
            aria-autocomplete="list"
            aria-controls="search-suggestions"
            aria-expanded={showSuggestions}
          />
          <button type="submit" className="sr-only">
            Search
          </button>
        </div>
      </form>

      {/* Suggestions dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <div
          id="search-suggestions"
          role="listbox"
          className="absolute z-50 mt-2 w-full overflow-hidden rounded-xl border border-[#2a2a2e] bg-[#1a1a1e] shadow-xl"
        >
          {suggestions.map((suggestion, index) => (
            <button
              key={suggestion.id}
              type="button"
              role="option"
              aria-selected={index === selectedIndex}
              onClick={() => handleSuggestionClick(suggestion)}
              onMouseEnter={() => setSelectedIndex(index)}
              className={`block w-full cursor-pointer border-b border-[#2a2a2e] px-4 py-3 text-left transition-colors last:border-b-0 ${
                index === selectedIndex
                  ? "bg-violet-500/10 text-violet-300"
                  : "text-gray-100 hover:bg-[#202024]"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 overflow-hidden">
                  <div className="truncate font-medium">{suggestion.name}</div>
                  {suggestion.description && (
                    <div className="mt-0.5 truncate text-sm text-gray-400">
                      {suggestion.description}
                    </div>
                  )}
                </div>
                <span className="shrink-0 rounded-md bg-[#2a2a2e] px-2 py-0.5 text-xs font-medium text-gray-400">
                  {getTypeLabel(suggestion.type)}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
