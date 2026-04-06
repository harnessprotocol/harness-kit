import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

type SearchScope = "component" | "profile";
type ComponentType = "skill" | "agent" | "hook" | "script" | "knowledge" | "rules";

export async function GET(request: NextRequest) {
  // Start performance monitoring
  const startTime = performance.now();

  const { searchParams } = request.nextUrl;
  const query = searchParams.get("q") ?? "";
  const scope = (searchParams.get("scope") as SearchScope) ?? "component";

  // Pagination parameters
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 100); // Max 100 per page

  // Filter parameters for components
  const componentType = searchParams.get("type") as ComponentType | null;
  const category = searchParams.get("category");
  const minRating = searchParams.get("rating");

  if (!query) {
    return NextResponse.json(
      { error: "Missing required query parameter: q" },
      { status: 400 },
    );
  }

  if (page < 1) {
    return NextResponse.json(
      { error: "Page must be >= 1" },
      { status: 400 },
    );
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
      .range(offset, offset + limit - 1);

    if (error) {
      // Fallback to ilike if FTS fails — use parameterized filters
      const { data: fallback, error: fallbackError } = await supabase
        .from("profiles")
        .select("*")
        .or(`name.ilike.%${query.replace(/[,().%_\\]/g, "")}%,description.ilike.%${query.replace(/[,().%_\\]/g, "")}%`)
        .order("name", { ascending: true })
        .range(offset, offset + limit - 1);

      if (fallbackError) {
        return NextResponse.json(
          { error: `Search failed: ${fallbackError.message}` },
          { status: 500 },
        );
      }

      const endTime = performance.now();
      const responseTime = ((endTime - startTime) / 1000).toFixed(3);

      return NextResponse.json(
        {
          type: "profile",
          results: fallback ?? [],
          pagination: {
            page,
            limit,
            hasMore: (fallback?.length ?? 0) === limit,
          },
        },
        {
          headers: {
            "X-Response-Time": `${responseTime}s`,
          },
        }
      );
    }

    const endTime = performance.now();
    const responseTime = ((endTime - startTime) / 1000).toFixed(3);

    return NextResponse.json(
      {
        type: "profile",
        results: data ?? [],
        pagination: {
          page,
          limit,
          hasMore: (data?.length ?? 0) === limit,
        },
      },
      {
        headers: {
          "X-Response-Time": `${responseTime}s`,
        },
      }
    );
  }

  // Default: search components using full-text search with filters
  try {
    const results = await searchComponents(tsquery, query, componentType, category, minRating, page, limit);

    const endTime = performance.now();
    const responseTime = ((endTime - startTime) / 1000).toFixed(3);

    return NextResponse.json(
      {
        type: "component",
        results: results.data,
        pagination: {
          page,
          limit,
          hasMore: results.hasMore,
        },
      },
      {
        headers: {
          "X-Response-Time": `${responseTime}s`,
        },
      }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: `Search failed: ${error.message}` },
      { status: 500 },
    );
  }
}

async function searchComponents(
  tsquery: string,
  rawQuery: string,
  componentType: ComponentType | null,
  category: string | null,
  minRating: string | null,
  page: number,
  limit: number,
): Promise<{ data: any[]; hasMore: boolean }> {
  const offset = (page - 1) * limit;
  // Step 1: Get component IDs that match the category filter (if specified)
  let categoryComponentIds: string[] | null = null;
  if (category) {
    const { data: categoryData, error: categoryError } = await supabase
      .from("component_categories")
      .select("component_id, category:categories!inner(slug)")
      .eq("categories.slug", category);

    if (categoryError) throw categoryError;
    categoryComponentIds = categoryData?.map((cc: any) => cc.component_id) ?? [];

    // If category filter is specified but no components match, return empty
    if (categoryComponentIds.length === 0) {
      return { data: [], hasMore: false };
    }
  }

  // Step 2: Build the main component search query with FTS
  let componentQuery = supabase
    .from("components")
    .select("*")
    .textSearch("fts", tsquery);

  // Apply component type filter
  if (componentType) {
    componentQuery = componentQuery.eq("type", componentType);
  }

  // Apply category filter (if we have matching component IDs)
  if (categoryComponentIds) {
    componentQuery = componentQuery.in("id", categoryComponentIds);
  }

  // Execute the query - fetch extra to determine if there are more pages
  // When rating filter is present, we need more data for post-filtering
  const fetchLimit = minRating ? Math.max(limit * 3, 100) : limit + 1;

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

    // Apply rating filter if specified
    if (minRating && fallback) {
      const minRatingNum = parseFloat(minRating);
      const filteredResults = await filterByRating(fallback, minRatingNum);
      const hasMore = filteredResults.length > limit;
      return {
        data: filteredResults.slice(0, limit),
        hasMore,
      };
    }

    const resultData = fallback ?? [];
    const hasMore = resultData.length > limit;
    return {
      data: resultData.slice(0, limit),
      hasMore,
    };
  }

  // Step 3: Apply rating filter if specified
  if (minRating && components) {
    const minRatingNum = parseFloat(minRating);
    const filteredResults = await filterByRating(components, minRatingNum);
    const hasMore = filteredResults.length > limit;
    return {
      data: filteredResults.slice(0, limit),
      hasMore,
    };
  }

  const resultData = components ?? [];
  const hasMore = resultData.length > limit;
  return {
    data: resultData.slice(0, limit),
    hasMore,
  };
}

// Helper function to filter components by minimum average rating
async function filterByRating(components: any[], minRating: number) {
  if (components.length === 0) return [];

  const componentIds = components.map(c => c.id);

  // Get average ratings for all components
  const { data: ratings } = await supabase
    .from("ratings")
    .select("component_id, rating")
    .in("component_id", componentIds);

  if (!ratings || ratings.length === 0) {
    // No ratings = only return if minRating is 0
    return minRating === 0 ? components : [];
  }

  // Calculate average rating per component
  const ratingMap = new Map<string, number>();
  const countMap = new Map<string, number>();

  ratings.forEach(r => {
    const current = ratingMap.get(r.component_id) || 0;
    const count = countMap.get(r.component_id) || 0;
    ratingMap.set(r.component_id, current + r.rating);
    countMap.set(r.component_id, count + 1);
  });

  // Calculate averages and filter
  return components.filter(component => {
    const totalRating = ratingMap.get(component.id);
    const count = countMap.get(component.id);

    if (!totalRating || !count) {
      return minRating === 0; // No ratings = only include if minRating is 0
    }

    const avgRating = totalRating / count;
    return avgRating >= minRating;
  });
}
