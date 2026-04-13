import type { ClaudeMcpServer } from "./mcp-types";

export interface McpServerMeta {
  displayName: string;
  description: string;
  /** simple-icons slug → used with cdn.simpleicons.org/{slug}/ffffff */
  iconSlug?: string;
  /** Background color for the icon container */
  iconBg?: string;
  docsUrl?: string;
  sourceUrl?: string;
  homepageUrl?: string;
}

// Keyed by exact npm package name (matched against args array)
const PACKAGE_META: Record<string, McpServerMeta> = {
  "@modelcontextprotocol/server-github": {
    displayName: "GitHub",
    description:
      "Search repos, manage issues and PRs, read files, and interact with GitHub resources.",
    iconSlug: "github",
    iconBg: "#24292e",
    docsUrl: "https://github.com/modelcontextprotocol/servers/tree/main/src/github",
    sourceUrl: "https://github.com/modelcontextprotocol/servers",
    homepageUrl: "https://github.com",
  },
  "@modelcontextprotocol/server-gitlab": {
    displayName: "GitLab",
    description: "Interact with GitLab projects, merge requests, and CI/CD pipelines.",
    iconSlug: "gitlab",
    iconBg: "#FC6D26",
    docsUrl: "https://github.com/modelcontextprotocol/servers/tree/main/src/gitlab",
    sourceUrl: "https://github.com/modelcontextprotocol/servers",
    homepageUrl: "https://gitlab.com",
  },
  "@modelcontextprotocol/server-slack": {
    displayName: "Slack",
    description: "Read channels, post messages, and search Slack workspaces.",
    iconSlug: "slack",
    iconBg: "#4A154B",
    docsUrl: "https://github.com/modelcontextprotocol/servers/tree/main/src/slack",
    sourceUrl: "https://github.com/modelcontextprotocol/servers",
    homepageUrl: "https://slack.com",
  },
  "@modelcontextprotocol/server-postgres": {
    displayName: "PostgreSQL",
    description: "Run SQL queries and explore schemas in PostgreSQL databases.",
    iconSlug: "postgresql",
    iconBg: "#336791",
    docsUrl: "https://github.com/modelcontextprotocol/servers/tree/main/src/postgres",
    sourceUrl: "https://github.com/modelcontextprotocol/servers",
    homepageUrl: "https://www.postgresql.org",
  },
  "@modelcontextprotocol/server-sqlite": {
    displayName: "SQLite",
    description: "Query and manipulate SQLite databases with full SQL support.",
    iconSlug: "sqlite",
    iconBg: "#003B57",
    docsUrl: "https://github.com/modelcontextprotocol/servers/tree/main/src/sqlite",
    sourceUrl: "https://github.com/modelcontextprotocol/servers",
    homepageUrl: "https://www.sqlite.org",
  },
  "@modelcontextprotocol/server-filesystem": {
    displayName: "Filesystem",
    description: "Read and write files within configured allowed directories.",
    iconBg: "#374151",
    docsUrl: "https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem",
    sourceUrl: "https://github.com/modelcontextprotocol/servers",
  },
  "@modelcontextprotocol/server-puppeteer": {
    displayName: "Puppeteer",
    description: "Automate Chrome via Puppeteer — screenshot, click, fill forms, scrape pages.",
    iconBg: "#00D8A2",
    docsUrl: "https://github.com/modelcontextprotocol/servers/tree/main/src/puppeteer",
    sourceUrl: "https://github.com/modelcontextprotocol/servers",
    homepageUrl: "https://pptr.dev",
  },
  "@modelcontextprotocol/server-brave-search": {
    displayName: "Brave Search",
    description: "Web and local search powered by the Brave Search API.",
    iconSlug: "brave",
    iconBg: "#BF3930",
    docsUrl: "https://github.com/modelcontextprotocol/servers/tree/main/src/brave-search",
    sourceUrl: "https://github.com/modelcontextprotocol/servers",
    homepageUrl: "https://search.brave.com",
  },
  "@modelcontextprotocol/server-fetch": {
    displayName: "Fetch",
    description: "Fetch web content — HTML, JSON, and raw text from any URL.",
    iconBg: "#2563EB",
    docsUrl: "https://github.com/modelcontextprotocol/servers/tree/main/src/fetch",
    sourceUrl: "https://github.com/modelcontextprotocol/servers",
  },
  "@modelcontextprotocol/server-memory": {
    displayName: "Memory",
    description: "Persistent knowledge graph memory — entities, relations, and observations.",
    iconBg: "#7C3AED",
    docsUrl: "https://github.com/modelcontextprotocol/servers/tree/main/src/memory",
    sourceUrl: "https://github.com/modelcontextprotocol/servers",
  },
  "@modelcontextprotocol/server-everything": {
    displayName: "Everything (test)",
    description:
      "Test server that exercises the full MCP spec — prompts, resources, tools, sampling.",
    iconBg: "#6B7280",
    sourceUrl: "https://github.com/modelcontextprotocol/servers",
  },
  "mcp-grafana": {
    displayName: "Grafana",
    description: "Query dashboards, metrics, logs, and alerts from your Grafana instance.",
    iconSlug: "grafana",
    iconBg: "#F05A28",
    docsUrl: "https://github.com/grafana/mcp-grafana",
    sourceUrl: "https://github.com/grafana/mcp-grafana",
    homepageUrl: "https://grafana.com",
  },
  "@supabase/mcp-server-supabase": {
    displayName: "Supabase",
    description: "Manage Supabase projects, run SQL queries, and explore your data.",
    iconSlug: "supabase",
    iconBg: "#1C1C1C",
    docsUrl: "https://github.com/supabase-community/supabase-mcp",
    sourceUrl: "https://github.com/supabase-community/supabase-mcp",
    homepageUrl: "https://supabase.com",
  },
  "@hypothesi/tauri-mcp-server": {
    displayName: "Tauri",
    description: "Interact with Tauri desktop application internals and APIs.",
    iconSlug: "tauri",
    iconBg: "#FFC131",
    docsUrl: "https://www.npmjs.com/package/@hypothesi/tauri-mcp-server",
    homepageUrl: "https://tauri.app",
  },
  "@notionhq/notion-mcp-server": {
    displayName: "Notion",
    description: "Read and write Notion pages, databases, and blocks.",
    iconSlug: "notion",
    iconBg: "#000000",
    docsUrl: "https://github.com/makenotion/notion-mcp-server",
    sourceUrl: "https://github.com/makenotion/notion-mcp-server",
    homepageUrl: "https://notion.so",
  },
  "@linear/mcp-server": {
    displayName: "Linear",
    description: "Create and manage Linear issues, projects, and cycles.",
    iconSlug: "linear",
    iconBg: "#5E6AD2",
    docsUrl: "https://github.com/linear/linear-mcp",
    sourceUrl: "https://github.com/linear/linear-mcp",
    homepageUrl: "https://linear.app",
  },
  "mcp-server-linear": {
    displayName: "Linear",
    description: "Create and manage Linear issues, projects, and cycles.",
    iconSlug: "linear",
    iconBg: "#5E6AD2",
    homepageUrl: "https://linear.app",
  },
  "@anthropic-ai/mcp-server-everything": {
    displayName: "Anthropic Everything",
    description: "Full-featured MCP reference server from Anthropic.",
    iconSlug: "anthropic",
    iconBg: "#D97706",
    homepageUrl: "https://anthropic.com",
  },
  "mcp-server-kubernetes": {
    displayName: "Kubernetes",
    description: "Manage Kubernetes clusters, pods, and workloads.",
    iconSlug: "kubernetes",
    iconBg: "#326CE5",
    homepageUrl: "https://kubernetes.io",
  },
  "@playwright/mcp": {
    displayName: "Playwright",
    description: "Browser automation via Playwright — navigate, click, screenshot, and scrape.",
    iconSlug: "playwright",
    iconBg: "#2EAD33",
    docsUrl: "https://github.com/microsoft/playwright-mcp",
    sourceUrl: "https://github.com/microsoft/playwright-mcp",
    homepageUrl: "https://playwright.dev",
  },
  "mcp-server-redis": {
    displayName: "Redis",
    description: "Get, set, and query Redis keys and data structures.",
    iconSlug: "redis",
    iconBg: "#DC382D",
    homepageUrl: "https://redis.io",
  },
  "mongodb-mcp-server": {
    displayName: "MongoDB",
    description: "Query and manage MongoDB Atlas databases.",
    iconSlug: "mongodb",
    iconBg: "#47A248",
    homepageUrl: "https://mongodb.com",
  },
  "@context7/mcp": {
    displayName: "Context7",
    description: "Fetch up-to-date documentation for any library directly into your context.",
    iconBg: "#0A0A0A",
    docsUrl: "https://context7.com",
    homepageUrl: "https://context7.com",
  },
};

// Fuzzy fallback: keyed by lowercase server name
const NAME_META: Record<string, McpServerMeta> = {
  grafana: PACKAGE_META["mcp-grafana"],
  github: PACKAGE_META["@modelcontextprotocol/server-github"],
  gitlab: PACKAGE_META["@modelcontextprotocol/server-gitlab"],
  slack: PACKAGE_META["@modelcontextprotocol/server-slack"],
  postgres: PACKAGE_META["@modelcontextprotocol/server-postgres"],
  postgresql: PACKAGE_META["@modelcontextprotocol/server-postgres"],
  sqlite: PACKAGE_META["@modelcontextprotocol/server-sqlite"],
  filesystem: PACKAGE_META["@modelcontextprotocol/server-filesystem"],
  supabase: PACKAGE_META["@supabase/mcp-server-supabase"],
  tauri: PACKAGE_META["@hypothesi/tauri-mcp-server"],
  notion: PACKAGE_META["@notionhq/notion-mcp-server"],
  linear: PACKAGE_META["@linear/mcp-server"],
  brave: PACKAGE_META["@modelcontextprotocol/server-brave-search"],
  puppeteer: PACKAGE_META["@modelcontextprotocol/server-puppeteer"],
  playwright: PACKAGE_META["@playwright/mcp"],
  redis: PACKAGE_META["mcp-server-redis"],
  mongodb: PACKAGE_META["mongodb-mcp-server"],
  kubernetes: PACKAGE_META["mcp-server-kubernetes"],
  fetch: PACKAGE_META["@modelcontextprotocol/server-fetch"],
  memory: PACKAGE_META["@modelcontextprotocol/server-memory"],
  context7: PACKAGE_META["@context7/mcp"],
};

export function lookupMcpServer(name: string, config: ClaudeMcpServer): McpServerMeta | null {
  // 1. Exact match on args entries
  if ("args" in config && config.args) {
    for (const arg of config.args) {
      if (PACKAGE_META[arg]) return PACKAGE_META[arg];
    }
    // Partial match — package name is a substring of an arg (handles `npx -y @pkg@latest`)
    for (const arg of config.args) {
      for (const [pkg, meta] of Object.entries(PACKAGE_META)) {
        if (arg.includes(pkg)) return meta;
      }
    }
  }

  // 2. Match by server name
  return NAME_META[name.toLowerCase()] ?? null;
}

// Deterministic avatar color derived from the server name
const AVATAR_COLORS = [
  "#7C3AED",
  "#2563EB",
  "#059669",
  "#D97706",
  "#DC2626",
  "#0891B2",
  "#DB2777",
  "#374151",
];

export function getAvatarColor(name: string): string {
  const sum = [...name].reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
}
