import { invoke } from "@tauri-apps/api/core";
import type { InstalledPlugin, KnownMarketplace, HooksConfig, StatsCache, SessionSummary, SessionFacet, ActiveSession, LiveDailyActivity } from "@harness-kit/shared";

// ── Plugin commands ──────────────────────────────────────────

export async function listInstalledPlugins(): Promise<InstalledPlugin[]> {
  return invoke<InstalledPlugin[]>("list_installed_plugins");
}

export async function listMarketplaces(): Promise<KnownMarketplace[]> {
  return invoke<KnownMarketplace[]>("list_marketplaces");
}

// ── Hook commands ────────────────────────────────────────────

export async function readHooks(): Promise<HooksConfig> {
  return invoke<HooksConfig>("read_hooks");
}

// ── Claude.md commands ───────────────────────────────────────

export async function readClaudeMd(path: string): Promise<string> {
  return invoke<string>("read_claude_md", { path });
}

// ── Settings / directory commands ────────────────────────────

export async function listClaudeDir(): Promise<string[]> {
  return invoke<string[]>("list_claude_dir");
}

// ── Observatory commands ──────────────────────────────────────

export async function readStatsCache(): Promise<StatsCache> {
  return invoke<StatsCache>("read_stats_cache");
}

export async function listSessionsSummary(): Promise<SessionSummary[]> {
  return invoke<SessionSummary[]>("list_sessions_summary");
}

export async function readSessionFacet(sessionId: string): Promise<SessionFacet | null> {
  return invoke<SessionFacet | null>("read_session_facet", { sessionId });
}

/** Reserved for future "active sessions" indicator in the Observatory sidebar */
export async function listActiveSessions(): Promise<ActiveSession[]> {
  return invoke<ActiveSession[]>("list_active_sessions");
}

export async function readLiveActivity(): Promise<LiveDailyActivity[]> {
  return invoke<LiveDailyActivity[]>("read_live_activity");
}
