// ── Core enums ──────────────────────────────────────────────

export type ComponentType =
  | "skill"
  | "agent"
  | "hook"
  | "script"
  | "knowledge"
  | "rules";

export type TrustTier = "official" | "verified" | "community";

// ── Core entities ───────────────────────────────────────────

export interface Author {
  name: string;
  url?: string;
}

export interface Component {
  id: string;
  slug: string;
  name: string;
  type: ComponentType;
  description: string;
  trust_tier: TrustTier;
  version: string;
  author: Author;
  license: string;
  skill_md: string | null;
  readme_md: string | null;
  repo_url: string | null;
  install_count: number;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  slug: string;
  name: string;
  description: string;
  author: Author;
  trust_tier: TrustTier;
  harness_yaml_template: string;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  slug: string;
  name: string;
  display_order: number;
}

export interface Tag {
  id: string;
  slug: string;
}

// ── Join tables ─────────────────────────────────────────────

export interface ComponentCategory {
  component_id: string;
  category_id: string;
}

export interface ComponentTag {
  component_id: string;
  tag_id: string;
}

export interface ProfileComponent {
  profile_id: string;
  component_id: string;
  pinned_version: string;
}

export interface ProfileCategory {
  profile_id: string;
  category_id: string;
}

export interface ProfileTag {
  profile_id: string;
  tag_id: string;
}

// ── Profile YAML (harness profile definitions) ─────────────

export interface ProfileYaml {
  name: string;
  description: string;
  author: Author;
  components: Array<{
    name: string;
    version: string;
  }>;
  knowledge?: {
    backend: string;
    seed_docs?: Array<{
      topic: string;
      description: string;
    }>;
  };
  rules?: string[];
}

// ── Desktop app types ────────────────────────────────────────

export interface ComponentCounts {
  skills: number;
  agents: number;
  scripts: number;
}

export interface InstalledPlugin {
  name: string;
  version: string;
  description?: string;
  marketplace?: string;
  source?: string;
  installed_at?: string;
  category?: string;
  tags?: string[];
  component_counts?: ComponentCounts;
}

export interface FileTreeNode {
  name: string;
  path: string;
  kind: "file" | "directory";
  children?: FileTreeNode[];
}

export interface PluginUpdateInfo {
  name: string;
  installed_version: string;
  latest_version: string;
  marketplace: string;
}

export interface KnownMarketplace {
  name: string;
  url: string;
  description?: string;
}

export type HookCommand = {
  type: string;
  command: string;
};

export type HooksConfig = Record<string, HookCommand[]>;

// ── Plugin manifest (plugin.json) ───────────────────────────

export interface PluginManifest {
  name: string;
  description: string;
  version: string;
  developed_with?: string;
  tags?: string[];
  category?: string;
  requires?: {
    env?: Array<{
      name: string;
      description: string;
      required: boolean;
      sensitive: boolean;
      when: string;
    }>;
  };
}

// ── Marketplace manifest (marketplace.json) ─────────────────

export interface MarketplaceCategory {
  slug: string;
  name: string;
  display_order: number;
}

export interface MarketplacePlugin {
  name: string;
  source: string;
  description: string;
  version: string;
  author: Author;
  license: string;
  category?: string;
  tags?: string[];
}

export interface MarketplaceManifest {
  name: string;
  owner: { name: string };
  metadata: {
    description: string;
    pluginRoot: string;
  };
  categories: MarketplaceCategory[];
  plugins: MarketplacePlugin[];
}

// ── Observatory types ─────────────────────────────────────────

export interface DailyActivity {
  date: string;
  messageCount?: number;
  sessionCount?: number;
  toolCallCount?: number;
}

export interface DailyModelTokens {
  date: string;
  tokensByModel?: Record<string, number>;
}

export interface ModelUsageEntry {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
}

export interface StatsCache {
  lastComputedDate?: string;
  dailyActivity?: DailyActivity[];
  dailyModelTokens?: DailyModelTokens[];
  modelUsage?: Record<string, ModelUsageEntry>;
  totalSessions?: number;
  totalMessages?: number;
  hourCounts?: Record<string, number>;
}

export interface SessionSummary {
  sessionId: string;
  project: string;
  projectShort: string;
  firstTimestamp: number;
  lastTimestamp: number;
  messageCount: number;
}

export interface SessionFacet {
  session_id: string;
  underlying_goal: string | null;
  outcome: string | null;
  claude_helpfulness: string | null;
  session_type: string | null;
  brief_summary: string | null;
  friction_counts: Record<string, number> | null;
}

export interface ActiveSession {
  pid: number;
  sessionId: string;
  cwd: string;
  startedAt: number;
}

export interface LiveDailyActivity {
  date: string;
  messageCount: number;
  sessionCount: number;
}

// ── Comparator types ────────────────────────────────────────

export interface HarnessInfo {
  id: string;
  name: string;
  command: string;
  available: boolean;
  version?: string;
  mode?: string; // "supported" | "unsupported"
}

export interface PanelConfig {
  panelId: string;
  harnessId: string;
  model?: string;
  workingDir?: string;
}

export interface ComparisonRequest {
  comparisonId: string;
  prompt: string;
  workingDir: string;
  pinnedCommit?: string;
  panels: PanelConfig[];
}

export interface PanelOutput {
  comparisonId: string;
  panelId: string;
  stream: "stdout" | "stderr";
  data: string;
}

export interface PanelComplete {
  comparisonId: string;
  panelId: string;
  exitCode: number | null;
  durationMs: number;
}

// ── Git types ───────────────────────────────────────────────

export interface GitRepoInfo {
  isGitRepo: boolean;
  currentCommit: string | null;
  branch: string | null;
}

export interface WorktreeResult {
  panelId: string;
  worktreePath: string;
}

export interface FileDiffEntry {
  filePath: string;
  diffText: string;
  changeType: string;
}

// ── Persistence types ───────────────────────────────────────

export interface ComparisonSummary {
  id: string;
  prompt: string;
  workingDir: string;
  pinnedCommit: string | null;
  createdAt: string;
  status: string;
  panels: PanelSummary[];
}

export interface PanelSummary {
  id: string;
  harnessId: string;
  harnessName: string;
  model: string | null;
  exitCode: number | null;
  durationMs: number | null;
  status: string;
}

export interface ComparisonDetail extends ComparisonSummary {
  panels: PanelDetail[];
}

export interface PanelDetail extends PanelSummary {
  outputText: string | null;
  diffs: FileDiff[];
  evaluation: EvaluationScores | null;
}

export interface FileDiff {
  filePath: string;
  diffText: string;
  changeType: string;
}

export interface EvaluationScores {
  id: string;
  panelId: string;
  correctness: number | null;
  completeness: number | null;
  codeQuality: number | null;
  efficiency: number | null;
  reasoning: number | null;
  speed: number | null;
  safety: number | null;
  contextAwareness: number | null;
  autonomy: number | null;
  adherence: number | null;
  overallScore: number | null;
  notes: string | null;
}

export interface PanelDiffs {
  panelId: string;
  harnessName: string;
  diffs: FileDiff[];
}

export interface ReplaySetup {
  prompt: string;
  workingDir: string;
  pinnedCommit: string | null;
  panels: ReplayPanel[];
}

export interface ReplayPanel {
  harnessId: string;
  harnessName: string;
  model: string | null;
}

export interface SaveEvaluationRequest {
  id: string;
  comparisonId: string;
  panelId: string;
  correctness: number | null;
  completeness: number | null;
  codeQuality: number | null;
  efficiency: number | null;
  reasoning: number | null;
  speed: number | null;
  safety: number | null;
  contextAwareness: number | null;
  autonomy: number | null;
  adherence: number | null;
  overallScore: number | null;
  notes: string | null;
}

export interface AnalyticsData {
  totalComparisons: number;
  winRates: HarnessWinRate[];
  modelWinRates: ModelWinRate[];
  dimensionAverages: DimensionAvg[];
}

export interface HarnessWinRate {
  harnessId: string;
  harnessName: string;
  wins: number;
  total: number;
  rate: number;
}

export interface ModelWinRate {
  model: string;
  wins: number;
  total: number;
  rate: number;
}

export interface DimensionAvg {
  harnessId: string;
  harnessName: string;
  dimension: string;
  avg: number;
}

// ── Security types ──────────────────────────────────────────

export interface PermissionsState {
  tools: { allow: string[]; deny: string[]; ask: string[] };
  paths: { writable: string[]; readonly: string[] };
  network: { allowedHosts: string[] };
}

export interface SecurityPreset {
  id: string;
  name: string;
  description: string;
  permissions: PermissionsState;
}

export interface KeychainSecretInfo {
  name: string;
  description: string;
  required: boolean;
  isSet: boolean;
  pluginName?: string;
}

export interface EnvConfigEntry {
  name: string;
  description: string;
  value: string;
  pluginName?: string;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  eventType: string;
  category: string;
  summary: string;
  details: string | null;
  source: string;
}
