import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

type SearchType = "component" | "profile";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const query = searchParams.get("q") ?? "";
  const type = (searchParams.get("type") as SearchType) ?? "component";

  if (!query) {
    return NextResponse.json(
      { error: "Missing required query parameter: q" },
      { status: 400 },
    );
  }

  // Convert query to tsquery format for full-text search
  const tsquery = query.trim().split(/\s+/).join(" & ");

  if (type === "profile") {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .textSearch("fts", tsquery)
      .order("name", { ascending: true })
      .limit(20);

    if (error) {
      // Fallback to ilike if FTS fails — use parameterized filters
      const { data: fallback, error: fallbackError } = await supabase
        .from("profiles")
        .select("*")
        .or(`name.ilike.%${query.replace(/[,().]/g, "")}%,description.ilike.%${query.replace(/[,().]/g, "")}%`)
        .order("name", { ascending: true })
        .limit(20);

      if (fallbackError) {
        return NextResponse.json(
          { error: `Search failed: ${fallbackError.message}` },
          { status: 500 },
        );
      }
      return NextResponse.json({ type: "profile", results: fallback ?? [] });
    }

    return NextResponse.json({ type: "profile", results: data ?? [] });
  }

  // Default: search components using full-text search
  const { data, error } = await supabase
    .from("components")
    .select("*")
    .textSearch("fts", tsquery)
    .order("install_count", { ascending: false })
    .limit(20);

  if (error) {
    // Fallback to ilike if FTS fails — sanitize PostgREST filter metacharacters
    const { data: fallback, error: fallbackError } = await supabase
      .from("components")
      .select("*")
      .or(`name.ilike.%${query.replace(/[,().]/g, "")}%,description.ilike.%${query.replace(/[,().]/g, "")}%`)
      .order("install_count", { ascending: false })
      .limit(20);

    if (fallbackError) {
      return NextResponse.json(
        { error: `Search failed: ${fallbackError.message}` },
        { status: 500 },
      );
    }
    return NextResponse.json({ type: "component", results: fallback ?? [] });
  }

  return NextResponse.json({ type: "component", results: data ?? [] });
}
