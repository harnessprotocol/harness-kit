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

export const onRequestPost: PagesFunction<Env> = async (context) => {
  let body: FeedbackBody;
  try {
    body = await context.request.json() as FeedbackBody;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { category, title, description, os, osVersion, arch, appVersion } = body;

  if (!title?.trim() || !description?.trim()) {
    return Response.json({ error: "Title and description are required" }, { status: 400 });
  }

  const token = context.env.GITHUB_TOKEN;
  if (!token) {
    return Response.json({ error: "Feedback service not configured" }, { status: 503 });
  }

  const prefix = TITLE_PREFIX[category] ?? "[Feedback]";
  const label = LABEL_MAP[category] ?? "feedback";

  const issueBody = [
    "## Description",
    "",
    description.trim(),
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
        title: `${prefix} ${title.trim()}`,
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
