import { invoke } from "@tauri-apps/api/core";
import type { InstalledPlugin, KnownMarketplace, HooksConfig } from "@harness-kit/shared";

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
