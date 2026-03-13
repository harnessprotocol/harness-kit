import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase not configured");
  return createClient(url, key);
}

interface InstallPayload {
  slug: string;
}

export async function POST(request: NextRequest) {
  const supabase = getServiceSupabase();
  let payload: InstallPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const { slug } = payload;

  if (!slug) {
    return NextResponse.json(
      { error: "Missing required field: slug" },
      { status: 400 },
    );
  }

  // Atomically increment install_count to avoid race conditions
  const { data: updated, error: updateError } = await supabase
    .rpc("increment_install_count", { component_slug: slug });

  if (updateError) {
    // Fallback: try direct update if RPC not available
    const { data: component, error: fetchError } = await supabase
      .from("components")
      .select("id, install_count")
      .eq("slug", slug)
      .single();

    if (fetchError || !component) {
      return NextResponse.json(
        { error: `Plugin not found: ${slug}` },
        { status: 404 },
      );
    }

    const { error: fallbackError } = await supabase
      .from("components")
      .update({ install_count: (component.install_count ?? 0) + 1 })
      .eq("id", component.id);

    if (fallbackError) {
      return NextResponse.json(
        { error: `Failed to update install count: ${fallbackError.message}` },
        { status: 500 },
      );
    }

    return NextResponse.json({
      slug,
      install_count: (component.install_count ?? 0) + 1,
    });
  }

  return NextResponse.json({
    slug,
    install_count: updated,
  });
}
