import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase not configured");
  return createClient(url, key);
}

const GITHUB_WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET ?? "";
const REPO_OWNER = "harnessprotocol";
const REPO_NAME = "harness-kit";

/** Verify GitHub webhook signature using Web Crypto API. */
async function verifySignature(
  payload: string,
  signature: string,
): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(GITHUB_WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  const digest = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const expected = `sha256=${digest}`;
  // Constant-time comparison to prevent timing attacks
  if (signature.length !== expected.length) return false;
  let result = 0;
  for (let i = 0; i < signature.length; i++) {
    result |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return result === 0;
}

/** List the top-level entries in a repo directory. Returns null on failure. */
async function fetchRepoDirEntries(
  dirPath: string,
): Promise<{ name: string; type: string }[] | null> {
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${dirPath}`;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "harness-kit-marketplace",
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { headers });
  if (!res.ok) return null;
  const data = await res.json();
  return Array.isArray(data) ? data : null;
}

/** Derive "skill" vs "plugin" by inspecting the plugin directory on GitHub. */
async function derivePluginType(
  pluginDir: string,
): Promise<"skill" | "plugin"> {
  const entries = await fetchRepoDirEntries(pluginDir);
  if (!entries) return "skill";

  const topNames = new Set(entries.filter((e) => e.type === "dir").map((e) => e.name));
  if (topNames.has("agents") || topNames.has("scripts") || topNames.has("hooks")) {
    return "plugin";
  }

  // Count skill subdirectories
  const skillsEntries = await fetchRepoDirEntries(`${pluginDir}/skills`);
  if (skillsEntries) {
    const skillDirCount = skillsEntries.filter((e) => e.type === "dir").length;
    if (skillDirCount > 1) return "plugin";
  }

  return "skill";
}

/** Fetch a file from the GitHub repo. */
async function fetchRepoFile(path: string): Promise<string | null> {
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3.raw",
    "User-Agent": "harness-kit-marketplace",
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(url, { headers });
  if (!res.ok) return null;
  return res.text();
}

interface MarketplacePlugin {
  name: string;
  source: string;
  description: string;
  version: string;
  author: { name: string; url?: string };
  license: string;
  category?: string;
  tags?: string[];
}

interface MarketplaceManifest {
  plugins: MarketplacePlugin[];
}

export async function POST(request: NextRequest) {
  const supabase = getServiceSupabase();
  // Verify webhook signature
  const body = await request.text();
  const signature = request.headers.get("x-hub-signature-256") ?? "";

  if (!GITHUB_WEBHOOK_SECRET) {
    console.warn("GITHUB_WEBHOOK_SECRET not set — rejecting webhook request");
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 500 },
    );
  }

  const valid = await verifySignature(body, signature);
  if (!valid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const event = JSON.parse(body);

  // Only process pushes to main branch
  if (event.ref !== "refs/heads/main") {
    return NextResponse.json({ message: "Ignored: not main branch" });
  }

  // Read marketplace.json from the repo
  const manifestRaw = await fetchRepoFile(".claude-plugin/marketplace.json");
  if (!manifestRaw) {
    return NextResponse.json(
      { error: "Could not read marketplace.json" },
      { status: 500 },
    );
  }

  const manifest: MarketplaceManifest = JSON.parse(manifestRaw);

  // Process each plugin
  const results: Array<{ name: string; status: string }> = [];

  for (const plugin of manifest.plugins) {
    // Resolve source path: "./plugins/research" -> "plugins/research"
    const pluginDir = plugin.source.replace("./", "");

    // Try to fetch SKILL.md and README.md
    const skillMd = await fetchRepoFile(
      `${pluginDir}/skills/${plugin.name}/SKILL.md`,
    );
    const readmeMd = await fetchRepoFile(
      `${pluginDir}/skills/${plugin.name}/README.md`,
    );

    const componentType = await derivePluginType(pluginDir);

    // Auto-extract tags from plugin manifest + description
    const autoTags = new Set(plugin.tags ?? []);
    autoTags.add(componentType);

    // Upsert component
    const { error } = await supabase
      .from("components")
      .upsert(
        {
          slug: plugin.name,
          name: plugin.name,
          type: componentType,
          description: plugin.description,
          trust_tier: "official",
          version: plugin.version,
          author: plugin.author,
          license: plugin.license,
          skill_md: skillMd,
          readme_md: readmeMd,
          repo_url: `https://github.com/${REPO_OWNER}/${REPO_NAME}/tree/main/${pluginDir}`,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "slug" },
      );

    if (error) {
      results.push({ name: plugin.name, status: `error: ${error.message}` });
    } else {
      // Upsert tags
      for (const tagSlug of autoTags) {
        await supabase
          .from("tags")
          .upsert({ slug: tagSlug }, { onConflict: "slug" });

        const { data: tagRow } = await supabase
          .from("tags")
          .select("id")
          .eq("slug", tagSlug)
          .single();

        const { data: compRow } = await supabase
          .from("components")
          .select("id")
          .eq("slug", plugin.name)
          .single();

        if (tagRow && compRow) {
          await supabase
            .from("component_tags")
            .upsert(
              { component_id: compRow.id, tag_id: tagRow.id },
              { onConflict: "component_id,tag_id" },
            );
        }
      }

      // Link component to category
      if (plugin.category) {
        const { data: catRow } = await supabase
          .from("categories")
          .select("id")
          .eq("slug", plugin.category)
          .single();

        const { data: compRow2 } = await supabase
          .from("components")
          .select("id")
          .eq("slug", plugin.name)
          .single();

        if (catRow && compRow2) {
          await supabase
            .from("component_categories")
            .upsert(
              { component_id: compRow2.id, category_id: catRow.id },
              { onConflict: "component_id,category_id" },
            );
        }
      }

      results.push({ name: plugin.name, status: "synced" });
    }
  }

  return NextResponse.json({
    message: "Sync complete",
    results,
  });
}
