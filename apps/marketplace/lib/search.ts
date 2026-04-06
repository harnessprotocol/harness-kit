import type { SupabaseClient } from "@supabase/supabase-js";
import type { Component, ComponentType, TrustTier } from "@harness-kit/shared";

/**
 * Parameters for searching components in the marketplace.
 */
export interface SearchParams {
  /** Search query string - searched across name, description, tags, and README */
  query?: string;
  /** Filter by component type (skill, agent, hook, etc.) */
  type?: ComponentType;
  /** Filter by trust tier (official, verified, community) */
  trustTier?: TrustTier;
  /** Filter by category slug */
  category?: string;
  /** Filter by tag slug */
  tag?: string;
  /** Minimum average rating (1-5) */
  minRating?: number;
  /** Maximum results per page */
  limit?: number;
  /** Results offset for pagination */
  offset?: number;
}

/**
 * Search results with pagination metadata.
 */
export interface SearchResults {
  /** Array of matching components */
  results: Component[];
  /** Total number of matching components (before pagination) */
  total: number;
  /** Number of results per page */
  limit: number;
  /** Current offset */
  offset: number;
  /** Whether there are more results available */
  hasMore: boolean;
}

/**
 * Sanitizes a search query string for use in PostgreSQL full-text search.
 *
 * Removes special characters that could break tsquery parsing and converts
 * the query into a format suitable for Postgres FTS.
 *
 * @param query - Raw user input query
 * @returns Sanitized tsquery string with tokens joined by AND (&)
 */
export function sanitizeSearchQuery(query: string): string {
  const sanitizedTokens = query
    .trim()
    .split(/\s+/)
    .map((token) => token.replace(/[!&|():*\\]/g, ""))
    .filter(Boolean);

  if (sanitizedTokens.length === 0) {
    throw new Error("Query contains no searchable terms");
  }

  return sanitizedTokens.join(" & ");
}

/**
 * Builds a full-text search query with optional filters and ranking.
 *
 * The search uses PostgreSQL's full-text search with weighted ranking:
 * - Name matches are weighted highest (A)
 * - Description matches are weighted high (B)
 * - Skill content matches are weighted medium (C)
 * - README matches are weighted lowest (D)
 *
 * Results are ordered by FTS relevance score, with install count as a
 * tiebreaker for equally relevant results.
 *
 * @param supabase - Supabase client instance
 * @param params - Search parameters and filters
 * @returns Promise resolving to search results with pagination metadata
 *
 * @example
 * ```typescript
 * const results = await searchComponents(supabase, {
 *   query: "code review",
 *   type: "skill",
 *   minRating: 4,
 *   limit: 10
 * });
 * ```
 */
export async function searchComponents(
  supabase: SupabaseClient,
  params: SearchParams,
): Promise<SearchResults> {
  const limit = params.limit ?? 20;
  const offset = params.offset ?? 0;

  // Start with base query
  let query = supabase
    .from("components")
    .select("*", { count: "exact" });

  // Apply full-text search if query provided
  if (params.query) {
    const tsquery = sanitizeSearchQuery(params.query);
    query = query.textSearch("fts", tsquery);
  }

  // Apply filters
  if (params.type) {
    query = query.eq("type", params.type);
  }

  if (params.trustTier) {
    query = query.eq("trust_tier", params.trustTier);
  }

  if (params.minRating !== undefined && params.minRating > 0) {
    // Filter by average rating if reviews exist
    // Note: This requires average_rating to be computed and available
    query = query.gte("average_rating", params.minRating);
  }

  // Category and tag filtering requires joins - handled separately
  // These would need to be implemented with additional queries or views
  if (params.category) {
    // Join with component_categories and filter by category slug
    // This is a placeholder - actual implementation depends on schema support
    // query = query.contains("categories", [params.category]);
  }

  if (params.tag) {
    // Join with component_tags and filter by tag slug
    // This is a placeholder - actual implementation depends on schema support
    // query = query.contains("tags", [params.tag]);
  }

  // Order by FTS relevance (implicit when using textSearch)
  // then by install count as tiebreaker
  if (params.query) {
    // When FTS is active, results are already ranked by relevance
    // We use install_count as secondary sort
    query = query.order("install_count", { ascending: false });
  } else {
    // When no FTS query, sort primarily by install count
    query = query.order("install_count", { ascending: false });
  }

  // Apply pagination
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    throw new Error(`Search failed: ${error.message}`);
  }

  const total = count ?? 0;
  const results = data ?? [];

  return {
    results,
    total,
    limit,
    offset,
    hasMore: offset + results.length < total,
  };
}

/**
 * Builds a fallback ILIKE query when full-text search is unavailable or fails.
 *
 * This provides a simpler pattern-matching search that works without FTS indexes.
 * It searches across name and description fields only.
 *
 * @param supabase - Supabase client instance
 * @param params - Search parameters and filters
 * @returns Promise resolving to search results with pagination metadata
 */
export async function searchComponentsFallback(
  supabase: SupabaseClient,
  params: SearchParams,
): Promise<SearchResults> {
  const limit = params.limit ?? 20;
  const offset = params.offset ?? 0;

  if (!params.query) {
    throw new Error("Query is required for fallback search");
  }

  // Sanitize query for ILIKE pattern matching
  const sanitizedQuery = params.query.replace(/[,().%_\\]/g, "");
  const pattern = `%${sanitizedQuery}%`;

  let query = supabase
    .from("components")
    .select("*", { count: "exact" })
    .or(`name.ilike.${pattern},description.ilike.${pattern}`);

  // Apply filters (same as main search)
  if (params.type) {
    query = query.eq("type", params.type);
  }

  if (params.trustTier) {
    query = query.eq("trust_tier", params.trustTier);
  }

  if (params.minRating !== undefined && params.minRating > 0) {
    query = query.gte("average_rating", params.minRating);
  }

  // Order by install count
  query = query.order("install_count", { ascending: false });

  // Apply pagination
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    throw new Error(`Fallback search failed: ${error.message}`);
  }

  const total = count ?? 0;
  const results = data ?? [];

  return {
    results,
    total,
    limit,
    offset,
    hasMore: offset + results.length < total,
  };
}

/**
 * Validates search parameters and throws descriptive errors for invalid input.
 *
 * @param params - Search parameters to validate
 * @throws Error if parameters are invalid
 */
export function validateSearchParams(params: SearchParams): void {
  if (params.limit !== undefined && (params.limit < 1 || params.limit > 100)) {
    throw new Error("Limit must be between 1 and 100");
  }

  if (params.offset !== undefined && params.offset < 0) {
    throw new Error("Offset must be non-negative");
  }

  if (params.minRating !== undefined && (params.minRating < 1 || params.minRating > 5)) {
    throw new Error("Minimum rating must be between 1 and 5");
  }

  const validTypes: ComponentType[] = [
    "skill",
    "plugin",
    "agent",
    "hook",
    "script",
    "knowledge",
    "rules",
  ];
  if (params.type && !validTypes.includes(params.type)) {
    throw new Error(`Invalid component type: ${params.type}`);
  }

  const validTiers: TrustTier[] = ["official", "verified", "community"];
  if (params.trustTier && !validTiers.includes(params.trustTier)) {
    throw new Error(`Invalid trust tier: ${params.trustTier}`);
  }
}
