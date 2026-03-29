import { describe, it, expect } from "vitest";
import type {
  ComponentType,
  TrustTier,
  Author,
  Component,
  Profile,
  Category,
  Tag,
  ComponentCategory,
  ComponentTag,
  ProfileComponent,
  ProfileCategory,
  ProfileTag,
  ProfileYaml,
  ComponentCounts,
  InstalledPlugin,
  FileTreeNode,
  PluginUpdateInfo,
  KnownMarketplace,
  HookCommand,
  HooksConfig,
  PluginManifest,
  MarketplaceCategory,
  MarketplacePlugin,
  MarketplaceManifest,
  DailyActivity,
  DailyModelTokens,
  ModelUsageEntry,
  StatsCache,
  SessionSummary,
  SessionFacet,
  ActiveSession,
  LiveDailyActivity,
  LiveStats,
  SessionTranscript,
  TranscriptEntry,
  HarnessInfo,
  PanelConfig,
  ComparisonRequest,
  PanelOutput,
  PanelComplete,
  GitRepoInfo,
  WorktreeResult,
  FileDiffEntry,
  ComparisonSummary,
  PanelSummary,
  ComparisonDetail,
  PanelDetail,
  FileDiff,
  EvaluationScores,
  PanelDiffs,
  ReplaySetup,
  ReplayPanel,
  SaveEvaluationRequest,
  AnalyticsData,
  HarnessWinRate,
  ModelWinRate,
  DimensionAvg,
  EvaluationSession,
  PairwiseVote,
  EloEntry,
  DimensionWinRate,
  PairwiseAnalytics,
  PermissionsState,
  SecurityPreset,
  KeychainSecretInfo,
  EnvConfigEntry,
  AuditEntry,
} from "../src/types.js";

describe("Core enums", () => {
  it("validates ComponentType union", () => {
    const validTypes: ComponentType[] = [
      "skill",
      "plugin",
      "agent",
      "hook",
      "script",
      "knowledge",
      "rules",
    ];
    expect(validTypes).toHaveLength(7);
  });

  it("validates TrustTier union", () => {
    const validTiers: TrustTier[] = ["official", "verified", "community"];
    expect(validTiers).toHaveLength(3);
  });
});

describe("Core entities", () => {
  it("validates Author interface", () => {
    const author: Author = {
      name: "test-author",
      url: "https://example.com",
    };
    expect(author.name).toBe("test-author");
    expect(author.url).toBe("https://example.com");
  });

  it("validates Author with optional url", () => {
    const author: Author = {
      name: "test-author",
    };
    expect(author.name).toBe("test-author");
    expect(author.url).toBeUndefined();
  });

  it("validates Component interface", () => {
    const component: Component = {
      id: "comp-1",
      slug: "test-component",
      name: "Test Component",
      type: "skill",
      description: "A test component",
      trust_tier: "community",
      version: "1.0.0",
      author: { name: "test" },
      license: "MIT",
      skill_md: "# Skill",
      readme_md: "# README",
      repo_url: "https://github.com/test/repo",
      install_count: 42,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-02T00:00:00Z",
    };
    expect(component.id).toBe("comp-1");
    expect(component.type).toBe("skill");
    expect(component.trust_tier).toBe("community");
  });

  it("validates Component with null fields", () => {
    const component: Component = {
      id: "comp-2",
      slug: "test",
      name: "Test",
      type: "plugin",
      description: "Test",
      trust_tier: "official",
      version: "1.0.0",
      author: { name: "test" },
      license: "Apache-2.0",
      skill_md: null,
      readme_md: null,
      repo_url: null,
      install_count: 0,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
    };
    expect(component.skill_md).toBeNull();
    expect(component.readme_md).toBeNull();
    expect(component.repo_url).toBeNull();
  });

  it("validates Profile interface", () => {
    const profile: Profile = {
      id: "prof-1",
      slug: "test-profile",
      name: "Test Profile",
      description: "A test profile",
      author: { name: "author" },
      trust_tier: "verified",
      harness_yaml_template: "version: 1\nplugins: []",
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-02T00:00:00Z",
    };
    expect(profile.id).toBe("prof-1");
    expect(profile.trust_tier).toBe("verified");
  });

  it("validates Category interface", () => {
    const category: Category = {
      id: "cat-1",
      slug: "productivity",
      name: "Productivity",
      display_order: 1,
    };
    expect(category.display_order).toBe(1);
  });

  it("validates Tag interface", () => {
    const tag: Tag = {
      id: "tag-1",
      slug: "testing",
    };
    expect(tag.slug).toBe("testing");
  });
});

describe("Join tables", () => {
  it("validates ComponentCategory interface", () => {
    const cc: ComponentCategory = {
      component_id: "comp-1",
      category_id: "cat-1",
    };
    expect(cc.component_id).toBe("comp-1");
  });

  it("validates ComponentTag interface", () => {
    const ct: ComponentTag = {
      component_id: "comp-1",
      tag_id: "tag-1",
    };
    expect(ct.tag_id).toBe("tag-1");
  });

  it("validates ProfileComponent interface", () => {
    const pc: ProfileComponent = {
      profile_id: "prof-1",
      component_id: "comp-1",
      pinned_version: "1.0.0",
    };
    expect(pc.pinned_version).toBe("1.0.0");
  });

  it("validates ProfileCategory interface", () => {
    const pc: ProfileCategory = {
      profile_id: "prof-1",
      category_id: "cat-1",
    };
    expect(pc.profile_id).toBe("prof-1");
  });

  it("validates ProfileTag interface", () => {
    const pt: ProfileTag = {
      profile_id: "prof-1",
      tag_id: "tag-1",
    };
    expect(pt.tag_id).toBe("tag-1");
  });
});

describe("Profile YAML", () => {
  it("validates ProfileYaml interface with all fields", () => {
    const yaml: ProfileYaml = {
      name: "Test Profile",
      description: "A test profile",
      author: { name: "test" },
      components: [
        { name: "skill-1", version: "1.0.0" },
        { name: "plugin-1", version: "2.0.0" },
      ],
      knowledge: {
        backend: "vector-db",
        seed_docs: [
          { topic: "API", description: "API docs" },
        ],
      },
      rules: ["rule1", "rule2"],
    };
    expect(yaml.components).toHaveLength(2);
    expect(yaml.knowledge?.backend).toBe("vector-db");
    expect(yaml.rules).toHaveLength(2);
  });

  it("validates ProfileYaml with optional fields omitted", () => {
    const yaml: ProfileYaml = {
      name: "Minimal Profile",
      description: "Minimal",
      author: { name: "test" },
      components: [],
    };
    expect(yaml.knowledge).toBeUndefined();
    expect(yaml.rules).toBeUndefined();
  });
});

describe("Desktop app types", () => {
  it("validates ComponentCounts interface", () => {
    const counts: ComponentCounts = {
      skills: 5,
      agents: 2,
      scripts: 3,
    };
    expect(counts.skills).toBe(5);
  });

  it("validates InstalledPlugin interface", () => {
    const plugin: InstalledPlugin = {
      name: "test-plugin",
      version: "1.0.0",
      description: "Test plugin",
      marketplace: "harness-kit",
      source: "./plugins/test",
      installed_at: "2024-01-01T00:00:00Z",
      category: "productivity",
      tags: ["testing", "dev"],
      component_counts: { skills: 1, agents: 0, scripts: 0 },
    };
    expect(plugin.name).toBe("test-plugin");
    expect(plugin.tags).toHaveLength(2);
  });

  it("validates InstalledPlugin with minimal fields", () => {
    const plugin: InstalledPlugin = {
      name: "minimal",
      version: "1.0.0",
    };
    expect(plugin.description).toBeUndefined();
  });

  it("validates FileTreeNode interface", () => {
    const tree: FileTreeNode = {
      name: "src",
      path: "./src",
      kind: "directory",
      children: [
        { name: "index.ts", path: "./src/index.ts", kind: "file" },
      ],
    };
    expect(tree.kind).toBe("directory");
    expect(tree.children).toHaveLength(1);
  });

  it("validates PluginUpdateInfo interface", () => {
    const update: PluginUpdateInfo = {
      name: "test-plugin",
      installed_version: "1.0.0",
      latest_version: "2.0.0",
      marketplace: "harness-kit",
    };
    expect(update.latest_version).toBe("2.0.0");
  });

  it("validates KnownMarketplace interface", () => {
    const marketplace: KnownMarketplace = {
      name: "harness-kit",
      url: "https://github.com/harnessprotocol/harness-kit",
      description: "Official marketplace",
    };
    expect(marketplace.name).toBe("harness-kit");
  });

  it("validates HookCommand interface", () => {
    const hook: HookCommand = {
      type: "skill",
      command: "/test",
    };
    expect(hook.type).toBe("skill");
  });

  it("validates HooksConfig type", () => {
    const config: HooksConfig = {
      "pre-commit": [
        { type: "skill", command: "/lint" },
      ],
      "post-build": [
        { type: "skill", command: "/test" },
        { type: "agent", command: "verify" },
      ],
    };
    expect(config["pre-commit"]).toHaveLength(1);
    expect(config["post-build"]).toHaveLength(2);
  });
});

describe("Plugin manifest", () => {
  it("validates PluginManifest interface with all fields", () => {
    const manifest: PluginManifest = {
      name: "test-plugin",
      description: "Test plugin",
      version: "1.0.0",
      developed_with: "claude-code",
      tags: ["test"],
      category: "productivity",
      requires: {
        env: [
          {
            name: "API_KEY",
            description: "API key",
            required: true,
            sensitive: true,
            when: "always",
          },
        ],
      },
    };
    expect(manifest.requires?.env).toHaveLength(1);
  });

  it("validates PluginManifest with minimal fields", () => {
    const manifest: PluginManifest = {
      name: "minimal",
      description: "Minimal",
      version: "1.0.0",
    };
    expect(manifest.developed_with).toBeUndefined();
  });
});

describe("Marketplace manifest", () => {
  it("validates MarketplaceCategory interface", () => {
    const category: MarketplaceCategory = {
      slug: "productivity",
      name: "Productivity",
      display_order: 1,
    };
    expect(category.display_order).toBe(1);
  });

  it("validates MarketplacePlugin interface", () => {
    const plugin: MarketplacePlugin = {
      name: "test",
      source: "./plugins/test",
      description: "Test",
      version: "1.0.0",
      author: { name: "test" },
      license: "MIT",
      category: "productivity",
      tags: ["test"],
    };
    expect(plugin.source).toBe("./plugins/test");
  });

  it("validates MarketplaceManifest interface", () => {
    const manifest: MarketplaceManifest = {
      name: "test-marketplace",
      owner: { name: "test-org" },
      metadata: {
        description: "Test marketplace",
        pluginRoot: "./plugins",
      },
      categories: [
        { slug: "productivity", name: "Productivity", display_order: 1 },
      ],
      plugins: [
        {
          name: "test",
          source: "./plugins/test",
          description: "Test",
          version: "1.0.0",
          author: { name: "test" },
          license: "MIT",
        },
      ],
    };
    expect(manifest.categories).toHaveLength(1);
    expect(manifest.plugins).toHaveLength(1);
  });
});

describe("Observatory types", () => {
  it("validates DailyActivity interface", () => {
    const activity: DailyActivity = {
      date: "2024-01-01",
      messageCount: 10,
      sessionCount: 2,
      toolCallCount: 15,
    };
    expect(activity.messageCount).toBe(10);
  });

  it("validates DailyModelTokens interface", () => {
    const tokens: DailyModelTokens = {
      date: "2024-01-01",
      tokensByModel: {
        "claude-3-5-sonnet": 1000,
        "claude-3-opus": 500,
      },
    };
    expect(tokens.tokensByModel).toBeDefined();
  });

  it("validates ModelUsageEntry interface", () => {
    const entry: ModelUsageEntry = {
      inputTokens: 1000,
      outputTokens: 500,
      cacheReadInputTokens: 200,
      cacheCreationInputTokens: 100,
    };
    expect(entry.inputTokens).toBe(1000);
  });

  it("validates StatsCache interface", () => {
    const cache: StatsCache = {
      lastComputedDate: "2024-01-01",
      dailyActivity: [{ date: "2024-01-01", messageCount: 10 }],
      dailyModelTokens: [{ date: "2024-01-01" }],
      modelUsage: { "claude-3-5-sonnet": { inputTokens: 1000 } },
      totalSessions: 5,
      totalMessages: 50,
      hourCounts: { "12": 10, "13": 15 },
    };
    expect(cache.totalSessions).toBe(5);
  });

  it("validates SessionSummary interface", () => {
    const summary: SessionSummary = {
      sessionId: "session-1",
      project: "/path/to/project",
      projectShort: "project",
      firstTimestamp: 1234567890,
      lastTimestamp: 1234567900,
      messageCount: 10,
    };
    expect(summary.sessionId).toBe("session-1");
  });

  it("validates SessionFacet interface", () => {
    const facet: SessionFacet = {
      session_id: "session-1",
      underlying_goal: "Build a feature",
      outcome: "success",
      claude_helpfulness: "very helpful",
      session_type: "coding",
      brief_summary: "Built feature X",
      friction_counts: { "tool-error": 2 },
    };
    expect(facet.underlying_goal).toBe("Build a feature");
  });

  it("validates ActiveSession interface", () => {
    const session: ActiveSession = {
      pid: 12345,
      sessionId: "session-1",
      cwd: "/path/to/project",
      startedAt: 1234567890,
    };
    expect(session.pid).toBe(12345);
  });

  it("validates LiveStats interface", () => {
    const stats: LiveStats = {
      dailyActivity: [],
      dailyModelTokens: [],
      modelUsage: {},
      hourCounts: {},
      totalToolCalls: 100,
      totalOutputTokens: 5000,
      scannedFiles: 50,
      scanDurationMs: 1000,
    };
    expect(stats.totalToolCalls).toBe(100);
  });

  it("validates SessionTranscript interface", () => {
    const transcript: SessionTranscript = {
      sessionId: "session-1",
      entries: [],
      totalInputTokens: 1000,
      totalOutputTokens: 500,
      totalToolCalls: 10,
      modelsUsed: ["claude-3-5-sonnet"],
      subagentCount: 2,
      truncated: false,
    };
    expect(transcript.modelsUsed).toHaveLength(1);
  });

  it("validates TranscriptEntry interface", () => {
    const entry: TranscriptEntry = {
      timestamp: "2024-01-01T00:00:00Z",
      role: "user",
      model: "claude-3-5-sonnet",
      toolNames: ["Read", "Write"],
      inputTokens: 100,
      outputTokens: 50,
      contentPreview: "Hello",
      isSubagent: false,
    };
    expect(entry.toolNames).toHaveLength(2);
  });
});

describe("Comparator types", () => {
  it("validates HarnessInfo interface", () => {
    const info: HarnessInfo = {
      id: "harness-1",
      name: "Test Harness",
      command: "test",
      available: true,
      version: "1.0.0",
      mode: "supported",
      authenticated: true,
      models: ["claude-3-5-sonnet"],
      defaultModel: "claude-3-5-sonnet",
    };
    expect(info.available).toBe(true);
  });

  it("validates PanelConfig interface", () => {
    const config: PanelConfig = {
      panelId: "panel-1",
      harnessId: "harness-1",
      model: "claude-3-5-sonnet",
      workingDir: "/path/to/dir",
    };
    expect(config.panelId).toBe("panel-1");
  });

  it("validates ComparisonRequest interface", () => {
    const request: ComparisonRequest = {
      comparisonId: "comp-1",
      prompt: "Test prompt",
      workingDir: "/path/to/dir",
      pinnedCommit: "abc123",
      panels: [
        { panelId: "panel-1", harnessId: "harness-1" },
      ],
    };
    expect(request.panels).toHaveLength(1);
  });

  it("validates PanelOutput interface", () => {
    const output: PanelOutput = {
      comparisonId: "comp-1",
      panelId: "panel-1",
      stream: "stdout",
      data: "output text",
    };
    expect(output.stream).toBe("stdout");
  });

  it("validates PanelComplete interface", () => {
    const complete: PanelComplete = {
      comparisonId: "comp-1",
      panelId: "panel-1",
      exitCode: 0,
      durationMs: 1000,
    };
    expect(complete.exitCode).toBe(0);
  });
});

describe("Git types", () => {
  it("validates GitRepoInfo interface", () => {
    const info: GitRepoInfo = {
      isGitRepo: true,
      currentCommit: "abc123",
      branch: "main",
    };
    expect(info.isGitRepo).toBe(true);
  });

  it("validates WorktreeResult interface", () => {
    const result: WorktreeResult = {
      panelId: "panel-1",
      worktreePath: "/path/to/worktree",
    };
    expect(result.worktreePath).toBe("/path/to/worktree");
  });

  it("validates FileDiffEntry interface", () => {
    const diff: FileDiffEntry = {
      filePath: "src/index.ts",
      diffText: "diff content",
      changeType: "modified",
    };
    expect(diff.changeType).toBe("modified");
  });
});

describe("Persistence types", () => {
  it("validates ComparisonSummary interface", () => {
    const summary: ComparisonSummary = {
      id: "comp-1",
      prompt: "Test",
      workingDir: "/path",
      pinnedCommit: "abc123",
      createdAt: "2024-01-01T00:00:00Z",
      status: "complete",
      panels: [],
    };
    expect(summary.status).toBe("complete");
  });

  it("validates PanelSummary interface", () => {
    const summary: PanelSummary = {
      id: "panel-1",
      harnessId: "harness-1",
      harnessName: "Test",
      model: "claude-3-5-sonnet",
      exitCode: 0,
      durationMs: 1000,
      status: "complete",
    };
    expect(summary.status).toBe("complete");
  });

  it("validates EvaluationScores interface", () => {
    const scores: EvaluationScores = {
      id: "eval-1",
      panelId: "panel-1",
      correctness: 8,
      completeness: 7,
      codeQuality: 9,
      efficiency: 8,
      reasoning: 8,
      speed: 7,
      safety: 9,
      contextAwareness: 8,
      autonomy: 7,
      adherence: 9,
      overallScore: 8,
      notes: "Good work",
    };
    expect(scores.overallScore).toBe(8);
  });

  it("validates EvaluationScores with null values", () => {
    const scores: EvaluationScores = {
      id: "eval-2",
      panelId: "panel-2",
      correctness: null,
      completeness: null,
      codeQuality: null,
      efficiency: null,
      reasoning: null,
      speed: null,
      safety: null,
      contextAwareness: null,
      autonomy: null,
      adherence: null,
      overallScore: null,
      notes: null,
    };
    expect(scores.correctness).toBeNull();
  });

  it("validates ReplaySetup interface", () => {
    const setup: ReplaySetup = {
      prompt: "Test",
      workingDir: "/path",
      pinnedCommit: "abc123",
      panels: [
        { harnessId: "harness-1", harnessName: "Test", model: "claude-3-5-sonnet" },
      ],
    };
    expect(setup.panels).toHaveLength(1);
  });

  it("validates AnalyticsData interface", () => {
    const data: AnalyticsData = {
      totalComparisons: 10,
      winRates: [],
      modelWinRates: [],
      dimensionAverages: [],
    };
    expect(data.totalComparisons).toBe(10);
  });

  it("validates HarnessWinRate interface", () => {
    const rate: HarnessWinRate = {
      harnessId: "harness-1",
      harnessName: "Test",
      wins: 5,
      total: 10,
      rate: 0.5,
    };
    expect(rate.rate).toBe(0.5);
  });
});

describe("Pairwise voting types", () => {
  it("validates EvaluationSession interface", () => {
    const session: EvaluationSession = {
      id: "session-1",
      comparisonId: "comp-1",
      evalMethod: "pairwise",
      blindOrder: "AB",
      revealedAt: "2024-01-01T00:00:00Z",
      createdAt: "2024-01-01T00:00:00Z",
    };
    expect(session.evalMethod).toBe("pairwise");
  });

  it("validates PairwiseVote interface", () => {
    const vote: PairwiseVote = {
      id: "vote-1",
      comparisonId: "comp-1",
      sessionId: "session-1",
      leftPanelId: "panel-1",
      rightPanelId: "panel-2",
      dimension: "correctness",
      result: "left",
      createdAt: "2024-01-01T00:00:00Z",
    };
    expect(vote.result).toBe("left");
  });

  it("validates EloEntry interface", () => {
    const entry: EloEntry = {
      panelId: "panel-1",
      harnessName: "Test",
      elo: 1500,
      wins: 5,
      losses: 3,
      ties: 2,
    };
    expect(entry.elo).toBe(1500);
  });

  it("validates PairwiseAnalytics interface", () => {
    const analytics: PairwiseAnalytics = {
      totalVotes: 10,
      eloRankings: [],
      dimensionWinRates: [],
    };
    expect(analytics.totalVotes).toBe(10);
  });
});

describe("Security types", () => {
  it("validates PermissionsState interface", () => {
    const perms: PermissionsState = {
      tools: {
        allow: ["Read", "Write"],
        deny: ["Bash"],
        ask: ["Agent"],
      },
      paths: {
        writable: ["./src"],
        readonly: ["./config"],
      },
      network: {
        allowedHosts: ["api.example.com"],
      },
    };
    expect(perms.tools.allow).toHaveLength(2);
  });

  it("validates SecurityPreset interface", () => {
    const preset: SecurityPreset = {
      id: "preset-1",
      name: "Strict",
      description: "Strict security",
      permissions: {
        tools: { allow: [], deny: [], ask: [] },
        paths: { writable: [], readonly: [] },
        network: { allowedHosts: [] },
      },
    };
    expect(preset.name).toBe("Strict");
  });

  it("validates KeychainSecretInfo interface", () => {
    const secret: KeychainSecretInfo = {
      name: "API_KEY",
      description: "API key",
      required: true,
      isSet: false,
      pluginName: "test-plugin",
    };
    expect(secret.required).toBe(true);
  });

  it("validates EnvConfigEntry interface", () => {
    const entry: EnvConfigEntry = {
      name: "NODE_ENV",
      description: "Node environment",
      value: "development",
      pluginName: "test-plugin",
    };
    expect(entry.value).toBe("development");
  });

  it("validates AuditEntry interface", () => {
    const entry: AuditEntry = {
      id: "audit-1",
      timestamp: "2024-01-01T00:00:00Z",
      eventType: "file-write",
      category: "security",
      summary: "File written",
      details: "Wrote file X",
      source: "claude-code",
    };
    expect(entry.category).toBe("security");
  });
});
