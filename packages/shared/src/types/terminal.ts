// ── Terminal / Harness types ─────────────────────────────────

export interface HarnessInfo {
  id: string;
  name: string;
  command: string;
  available: boolean;
  version?: string;
  mode?: string;
  authenticated: boolean;
  models: string[];
  defaultModel?: string;
}
