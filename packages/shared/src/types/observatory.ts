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

export interface LiveStats {
  dailyActivity: DailyActivity[];
  dailyModelTokens: DailyModelTokens[];
  modelUsage: Record<string, ModelUsageEntry>;
  hourCounts: Record<string, number>;
  totalToolCalls: number;
  totalOutputTokens: number;
  scannedFiles: number;
  scanDurationMs: number;
}

export interface SessionTranscript {
  sessionId: string;
  entries: TranscriptEntry[];
  totalInputTokens: number;
  totalOutputTokens: number;
  totalToolCalls: number;
  modelsUsed: string[];
  subagentCount: number;
  truncated: boolean;
}

export interface TranscriptEntry {
  timestamp: string | null;
  role: string;
  model: string | null;
  toolNames: string[];
  inputTokens: number | null;
  outputTokens: number | null;
  contentPreview: string | null;
  isSubagent: boolean;
}
