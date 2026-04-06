import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

const VALID_SCOPES = new Set(["component", "profile"]);
const VALID_COMPONENT_TYPES = new Set([
  "skill", "agent", "hook", "script", "knowledge", "rules", "plugin",
]);

export async function GET(request: NextRequest) {
  const startTime = performance.now();

  const { searchParams } = request.nextUrl;
  const query = searchParams.get("q") ?? "";

  if (!query) {
    return NextResponse.json(
      { error: "Missing required query parameter: q" },
      { status: 400 },
    );
  }

  if (query.length > 200) {
    return NextResponse.json(
      { error: "Query too long (max 200 characters)" },
      { status: 400 },
    );
  }

  const scopeParam = searchParams.get("scope") ?? "component";
  if (!VALID_SCOPES.has(scopeParam)) {
    return NextResponse.json(
      { error: "Invalid scope. Must be 'component' or 'profile'" },
      { status: 400 },
    );
  }
  const scope = scopeParam as "component" | "profile";

  // Pagination parameters
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 100);

  if (page < 1) {
    return NextResponse.json(
      { error: "Page must be >= 1" },
      { status: 400 },
    );
  }

  // Filter parameters — validated before use
  const componentTypeParam = searchParams.get("type");
  if (componentTypeParam !== null && !VALID_COMPONENT_TYPES.has(componentTypeParam)) {
    return NextResponse.json(
      { error: `Invalid type filter. Must be one of: ${[...VALID_COMPONENT_TYPES].join(", ")}` },
      { status: 400 },
    );
  }
  const componentType = componentTypeParam as string | null;

  const category = searchParams.get("category");

  // Parse and validate rating at the boundary
  let minRating: number | null = null;
  const ratingParam = searchParams.get("rating");
  if (ratingParam !== null) {
    const parsed = parseFloat(ratingParam);
    if (isNaN(parsed) || parsed < 1 || parsed > 5) {
      return NextResponse.json(
        { error: "Rating must be a number between 1 and 5" },
        { status: 400 },
      );
    }
    minRating = parsed;
  }

  // 60 searches per minute per IP
  const ip = getClientIp(request);
  const { allowed, retryAfter } = checkRateLimit(`search:${ip}`, {
    maxRequests: 60,
    windowMs: 60 * 1000,
  });
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  // Sanitize and convert query to tsquery format for full-text search
  const sanitizedTokens = query
    .trim()
    .split(/\s+/)
    .map((token) => token.replace(/[!&|():*\\]/g, ""))
    .filter(Boolean);

  if (sanitizedTokens.length === 0) {
    return NextResponse.json(
      { error: "Query contains no searchable terms" },
      { status: 400 },
    );
  }

  const tsquery = sanitizedTokens.join(" & ");
  const offset = (page - 1) * limit;

  if (scope === "profile") {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .textSearch("fts", tsquery)
      .order("name", { ascending: true })
      .range(offset, offset + limit);  // fetch limit+1 to detect hasMore

    if (error) {
      // Fallback to ilike if FTS fails — use parameterized filters
      const { data: fallback, error: fallbackError } = await supabase
        .from("profiles")
        .select("*")
        .or(`name.ilike.%${query.replace(/[,().%_\\]/g, "")}%,description.ilike.%${query.replace(/[,().%_\\]/g, "")}%`)
        .order("name", { ascending: true })
        .range(offset, offset + limit);  // fetch limit+1 to detect hasMore

      if (fallbackError) {
        console.error("[search] profile fallback failed", fallbackError);
        return NextResponse.json({ error: "Search failed" }, { status: 500 });
      }

      const results = fallback ?? [];
      return jsonResponse(startTime, {
        type: "profile",
        results: results.slice(0, limit),
        pagination: { page, limit, hasMore: results.length > limit },
      });
    }

    const results = data ?? [];
    return jsonResponse(startTime, {
      type: "profile",
      results: results.slice(0, limit),
      pagination: { page, limit, hasMore: results.length > limit },
    });
  }

  // Default: search components using full-text search with filters
  try {
    const results = await searchComponents(tsquery, query, componentType, category, minRating, page, limit);
    return jsonResponse(startTime, {
      type: "component",
      results: results.data,
      pagination: { page, limit, hasMore: results.hasMore },
    });
  } catch (err) {
    console.error("[search] component search failed", err);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}

function jsonResponse(startTime: number, body: object) {
  const responseTime = ((performance.now() - startTime) / 1000).toFixed(3);
  return NextResponse.json(body, {
    headers: { "X-Response-Time": `${responseTime}s` },
  });
}

async function searchComponents(
  tsquery: string,
  rawQuery: string,
  componentType: string | null,
  category: string | null,
  minRating: number | null,
  page: number,
  limit: number,
): Promise<{ data: any[]; hasMore: boolean }> {
  const offset = (page - 1) * limit;

  // Step 1: Resolve category filter to component IDs (if specified)
  let categoryComponentIds: string[] | null = null;
  if (category) {
    const { data: categoryData, error: categoryError } = await supabase
      .from("component_categories")
      .select("component_id, category:categories!inner(slug)")
      .eq("categories.slug", category);

    if (categoryError) throw categoryError;
    categoryComponentIds = categoryData?.map((cc: any) => cc.component_id) ?? [];

    if (categoryComponentIds.length === 0) {
      return { data: [], hasMore: false };
    }
  }

  // Step 2: Build and execute the FTS query
  let componentQuery = supabase
    .from("components")
    .select("*")
    .textSearch("fts", tsquery);

  if (componentType) {
    componentQuery = componentQuery.eq("type", componentType);
  }

  if (categoryComponentIds) {
    componentQuery = componentQuery.in("id", categoryComponentIds);
  }

  // When a rating filter is active, over-fetch to compensate for post-filter attrition
  const fetchLimit = minRating !== null ? Math.max(limit * 3, 100) : limit + 1;

  const { data: components, error } = await componentQuery
    .order("install_count", { ascending: false })
    .range(offset, offset + fetchLimit - 1);

  if (error) {
    // Fallback to ilike if FTS fails
    let fallbackQuery = supabase
      .from("components")
      .select("*")
      .or(`name.ilike.%${rawQuery.replace(/[,().%_\\]/g, "")}%,description.ilike.%${rawQuery.replace(/[,().%_\\]/g, "")}%`);

    if (componentType) {
      fallbackQuery = fallbackQuery.eq("type", componentType);
    }

    if (categoryComponentIds) {
      fallbackQuery = fallbackQuery.in("id", categoryComponentIds);
    }

    const { data: fallback, error: fallbackError } = await fallbackQuery
      .order("install_count", { ascending: false })
      .range(offset, offset + fetchLimit - 1);

    if (fallbackError) throw fallbackError;

    return applyRatingFilter(fallback ?? [], minRating, limit);
  }

  return applyRatingFilter(components ?? [], minRating, limit);
}

async function applyRatingFilter(
  components: any[],
  minRating: number | null,
  limit: number,
): Promise<{ data: any[]; hasMore: boolean }> {
  if (minRating === null) {
    const hasMore = components.length > limit;
    return { data: components.slice(0, limit), hasMore };
  }

  const filtered = await filterByRating(components, minRating);
  const hasMore = filtered.length > limit;
  return { data: filtered.slice(0, limit), hasMore };
}

async function filterByRating(components: any[], minRating: number): Promise<any[]> {
  if (components.length === 0) return [];

  const componentIds = components.map(c => c.id);

  const { data: ratings } = await supabase
    .from("ratings")
    .select("component_id, rating")
    .in("component_id", componentIds);

  if (!ratings || ratings.length === 0) {
    return [];
  }

  // Compute average rating per component
  const ratingSum = new Map<string, number>();
  const ratingCount = new Map<string, number>();

  for (const r of ratings) {
    ratingSum.set(r.component_id, (ratingSum.get(r.component_id) ?? 0) + r.rating);
    ratingCount.set(r.component_id, (ratingCount.get(r.component_id) ?? 0) + 1);
  }

  return components.filter(component => {
    const sum = ratingSum.get(component.id);
    const count = ratingCount.get(component.id);
    if (sum === undefined || count === undefined) return false;
    return sum / count >= minRating;
  });
}
