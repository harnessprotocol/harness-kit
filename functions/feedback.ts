interface Env {
  GITHUB_TOKEN: string;
}

interface FeedbackBody {
  category: string;
  title: string;
  description: string;
  os: string;
  osVersion: string;
  arch: string;
  appVersion: string;
}

const LABEL_MAP: Record<string, string> = {
  bug_report: "bug",
  feature_request: "enhancement",
  general_feedback: "feedback",
  question: "question",
};

const TITLE_PREFIX: Record<string, string> = {
  bug_report: "[Bug Report]",
  feature_request: "[Feature Request]",
  general_feedback: "[Feedback]",
  question: "[Question]",
};

// ── Rate limiting ─────────────────────────────────────────────
// Per-IP sliding window: max 5 submissions per hour.
// Module-level state persists across requests within the same
// worker instance. Good enough for beta-scale traffic.

const MAX_PER_HOUR = 5;
const WINDOW_MS = 60 * 60 * 1000;
const rateLimitMap = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = (rateLimitMap.get(ip) ?? []).filter(t => now - t < WINDOW_MS);
  if (timestamps.length >= MAX_PER_HOUR) return true;
  timestamps.push(now);
  rateLimitMap.set(ip, timestamps);
  return false;
}

// Prevent the map from growing unboundedly if the worker stays
// alive for a long time (e.g. high-traffic edge instance).
function pruneRateLimitMap() {
  const now = Date.now();
  for (const [ip, timestamps] of rateLimitMap) {
    const recent = timestamps.filter(t => now - t < WINDOW_MS);
    if (recent.length === 0) rateLimitMap.delete(ip);
    else rateLimitMap.set(ip, recent);
  }
}

// ── Input limits ──────────────────────────────────────────────
const MAX_TITLE_LEN = 200;
const MAX_DESC_LEN = 10_000;

export const onRequestPost: PagesFunction<Env> = async (context) => {
  // Rate limit by connecting IP (CF-Connecting-IP is always present on CF edge).
  const ip = context.request.headers.get("CF-Connecting-IP") ?? "unknown";
  if (isRateLimited(ip)) {
    // Prune stale entries opportunistically on rejections to keep memory tidy.
    pruneRateLimitMap();
    return Response.json(
      { error: "Too many submissions. Please wait before trying again." },
      { status: 429 },
    );
  }

  let body: FeedbackBody;
  try {
    body = await context.request.json() as FeedbackBody;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { category, os, osVersion, arch, appVersion } = body;
  let { title, description } = body;

  if (!title?.trim() || !description?.trim()) {
    return Response.json({ error: "Title and description are required" }, { status: 400 });
  }

  // Enforce server-side length caps (client can't be trusted).
  title = title.trim().slice(0, MAX_TITLE_LEN);
  description = description.trim().slice(0, MAX_DESC_LEN);

  const token = context.env.GITHUB_TOKEN;
  if (!token) {
    return Response.json({ error: "Feedback service not configured" }, { status: 503 });
  }

  const prefix = TITLE_PREFIX[category] ?? "[Feedback]";
  const label = LABEL_MAP[category] ?? "feedback";

  const issueBody = [
    "## Description",
    "",
    description,
    "",
    "## System Info",
    "",
    "| Field | Value |",
    "|-------|-------|",
    `| OS | ${os} ${osVersion} |`,
    `| Architecture | ${arch} |`,
    `| App Version | ${appVersion} |`,
    "",
    "---",
    "*Submitted from Harness Kit desktop app*",
  ].join("\n");

  const ghResponse = await fetch(
    "https://api.github.com/repos/harnessprotocol/harness-kit-feedback/issues",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
        "User-Agent": "harness-kit-feedback/1.0",
      },
      body: JSON.stringify({
        title: `${prefix} ${title}`,
        body: issueBody,
        labels: [label, "desktop-app"],
      }),
    },
  );

  if (!ghResponse.ok) {
    const err = await ghResponse.text();
    console.error("GitHub API error:", ghResponse.status, err);
    return Response.json({ error: "Failed to create issue" }, { status: 502 });
  }

  const issue = await ghResponse.json() as { html_url: string };
  return Response.json({ issueUrl: issue.html_url });
};
