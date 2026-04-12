// ── Comparator types ────────────────────────────────────────

export type ComparisonPhase = "setup" | "execution" | "results" | "judge";
export type ComparisonStatus = "running" | "completed" | "cancelled";
export type PanelStatus = "running" | "completed" | "failed" | "cancelled";

export interface ComparisonSummary {
  id: string;
  title: string | null;
  prompt: string;
  workingDir: string;
  pinnedCommit: string | null;
  createdAt: string;
  status: ComparisonStatus;
  panelCount: number;
  harnessNames: string[];
}

export interface ComparisonDetail {
  id: string;
  title: string | null;
  prompt: string;
  workingDir: string;
  pinnedCommit: string | null;
  createdAt: string;
  status: ComparisonStatus;
  panels: PanelDetail[];
}

export interface PanelDetail {
  id: string;
  harnessId: string;
  harnessName: string;
  model: string | null;
  exitCode: number | null;
  durationMs: number | null;
  status: PanelStatus;
}

export interface FileDiffInput {
  filePath: string;
  diffText: string;
  changeType: string;
}

export interface FileDiffRow {
  id: number;
  comparisonId: string;
  panelId: string;
  filePath: string;
  diffText: string;
  changeType: string;
}
