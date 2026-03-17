import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase not configured");
  return createClient(url, key);
}

interface RegisterPayload {
  repo_url: string;
  plugin_path: string;
}

interface PluginManifest {
  name: string;
  description: string;
  version: string;
}

/** Fetch raw file from a GitHub repo URL + path. */
async function fetchGitHubFile(
  repoUrl: string,
  filePath: string,
): Promise<string | null> {
  // Parse "https://github.com/owner/repo" into API URL
  const match = repoUrl.match(
    /github\.com\/([^/]+)\/([^/]+)/,
  );
  if (!match) return null;

  const [, owner, repo] = match;
  const cleanRepo = repo.replace(/\.git$/, "");
  const url = `https://api.github.com/repos/${owner}/${cleanRepo}/contents/${filePath}`;

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

export async function POST(request: NextRequest) {
  // Require API key for registration to prevent spam
  const apiKey = process.env.REGISTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Registration not configured" },
      { status: 503 },
    );
  }

  const authHeader = request.headers.get("authorization") ?? "";
  if (authHeader !== `Bearer ${apiKey}`) {
    return NextResponse.json(
      { error: "Invalid or missing API key" },
      { status: 401 },
    );
  }

  // 10 registrations per hour per IP
  const ip = getClientIp(request);
  const { allowed, retryAfter } = checkRateLimit(`register:${ip}`, {
    maxRequests: 10,
    windowMs: 60 * 60 * 1000,
  });
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  const supabase = getServiceSupabase();
  let payload: RegisterPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const { repo_url, plugin_path } = payload;

  if (!repo_url || !plugin_path) {
    return NextResponse.json(
      { error: "Missing required fields: repo_url, plugin_path" },
      { status: 400 },
    );
  }

  // Validate repo structure: must have plugin.json
  const manifestPath = `${plugin_path}/.claude-plugin/plugin.json`;
  const manifestRaw = await fetchGitHubFile(repo_url, manifestPath);

  if (!manifestRaw) {
    return NextResponse.json(
      {
        error: `Could not find plugin manifest at ${manifestPath}. Ensure the repo is public and the path is correct.`,
      },
      { status: 422 },
    );
  }

  let manifest: PluginManifest;
  try {
    manifest = JSON.parse(manifestRaw);
  } catch {
    return NextResponse.json(
      { error: "Could not parse plugin.json" },
      { status: 422 },
    );
  }

  if (!manifest.name || !manifest.description || !manifest.version) {
    return NextResponse.json(
      {
        error:
          "plugin.json must include name, description, and version fields",
      },
      { status: 422 },
    );
  }

  // Check for duplicate slug
  const { data: existing } = await supabase
    .from("components")
    .select("id")
    .eq("slug", manifest.name)
    .single();

  if (existing) {
    return NextResponse.json(
      { error: `Component with slug "${manifest.name}" already exists` },
      { status: 409 },
    );
  }

  // Try to fetch SKILL.md and README.md
  const skillMd = await fetchGitHubFile(
    repo_url,
    `${plugin_path}/skills/${manifest.name}/SKILL.md`,
  );
  const readmeMd = await fetchGitHubFile(
    repo_url,
    `${plugin_path}/skills/${manifest.name}/README.md`,
  );

  // Parse author from repo URL
  const ownerMatch = repo_url.match(/github\.com\/([^/]+)/);
  const authorName = ownerMatch ? ownerMatch[1] : "unknown";

  // Create component with community trust tier
  const { data: component, error } = await supabase
    .from("components")
    .insert({
      slug: manifest.name,
      name: manifest.name,
      type: "skill",
      description: manifest.description,
      trust_tier: "community",
      version: manifest.version,
      author: { name: authorName },
      license: "unknown",
      skill_md: skillMd,
      readme_md: readmeMd,
      repo_url: repo_url,
      install_count: 0,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { error: `Failed to create component: ${error.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      message: "Component registered successfully",
      component,
    },
    { status: 201 },
  );
}
