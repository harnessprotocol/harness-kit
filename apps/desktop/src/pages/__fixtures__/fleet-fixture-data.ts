import type { FleetReport } from "@harness-kit/core";
import type { HarnessInfo } from "@harness-kit/shared";

/**
 * Static fixture data for the Fleet screenshot harness (see
 * apps/desktop/src/pages/__fixtures__/FleetFixture.tsx). Shaped exactly like
 * a real buildFleetReport() result so FleetView renders identically to the
 * live page — this file has no Tauri/core dependency at runtime.
 */
export const FLEET_FIXTURE_REPORT: FleetReport = {
  scopes: [
    { kind: "global", root: "/Users/dev", label: "Global" },
    { kind: "project", root: "/Users/dev/projects/harness-kit", label: "harness-kit" },
  ],
  rows: [
    {
      adapter: "claude-code",
      cells: {
        "/Users/dev": { adapter: "claude-code", targets: ["claude-code"], status: "in-sync", driftCount: 0, detail: "deployed config matches harness.yaml" },
        "/Users/dev/projects/harness-kit": { adapter: "claude-code", targets: ["claude-code"], status: "drift", driftCount: 3, detail: "3 drifted item(s)" },
      },
    },
    {
      adapter: "cursor",
      cells: {
        "/Users/dev": { adapter: "cursor", targets: ["cursor"], status: "in-sync", driftCount: 0, detail: "deployed config matches harness.yaml" },
        "/Users/dev/projects/harness-kit": { adapter: "cursor", targets: ["cursor"], status: "in-sync", driftCount: 0, detail: "deployed config matches harness.yaml" },
      },
    },
    {
      adapter: "copilot",
      cells: {
        "/Users/dev": { adapter: "copilot", targets: ["copilot"], status: "not-configured", driftCount: 0, detail: "tool detected but no valid harness.yaml found for this scope" },
        "/Users/dev/projects/harness-kit": { adapter: "copilot", targets: ["copilot"], status: "drift", driftCount: 1, detail: "1 drifted item(s)" },
      },
    },
    {
      adapter: "opencode",
      cells: {
        "/Users/dev": { adapter: "opencode", targets: ["opencode"], status: "not-installed", driftCount: 0, detail: "no indicators found for this tool in this scope" },
        "/Users/dev/projects/harness-kit": { adapter: "opencode", targets: ["opencode"], status: "not-installed", driftCount: 0, detail: "no indicators found for this tool in this scope" },
      },
    },
    {
      adapter: "agents-md",
      cells: {
        "/Users/dev": { adapter: "agents-md", targets: ["codex", "windsurf", "gemini", "junie"], status: "in-sync", driftCount: 0, detail: "deployed config matches harness.yaml" },
        "/Users/dev/projects/harness-kit": { adapter: "agents-md", targets: ["codex", "windsurf", "gemini", "junie"], status: "not-configured", driftCount: 0, detail: "tool detected but no valid harness.yaml found for this scope" },
      },
    },
  ],
  summary: { inSync: 6, drift: 2, notConfigured: 2, notInstalled: 2 },
};

export const FLEET_FIXTURE_HARNESSES: HarnessInfo[] = [
  { id: "claude", name: "Claude Code", command: "claude", available: true, version: "1.5.2", authenticated: true, models: [] },
  { id: "cursor-agent", name: "Cursor Agent", command: "agent", available: true, version: "0.9.1", authenticated: true, models: [] },
  { id: "copilot", name: "GitHub Copilot", command: "copilot", available: true, version: "1.0.4", authenticated: true, models: [] },
];
