import type { TaskCategory, TaskComplexity } from "./board-api";

export const CATEGORY_CONFIG: Record<TaskCategory, { label: string; color: string }> = {
  feature: { label: "Feature", color: "#8b5cf6" },
  bug_fix: { label: "Bug Fix", color: "#ef4444" },
  refactoring: { label: "Refactor", color: "#06b6d4" },
  docs: { label: "Docs", color: "#64748b" },
  security: { label: "Security", color: "#f97316" },
  performance: { label: "Perf", color: "#eab308" },
  ui_ux: { label: "UI/UX", color: "#ec4899" },
  infrastructure: { label: "Infra", color: "#6366f1" },
  testing: { label: "Testing", color: "#14b8a6" },
};

export const COMPLEXITY_CONFIG: Record<TaskComplexity, { label: string; dots: number }> = {
  trivial: { label: "Trivial", dots: 1 },
  small: { label: "Small", dots: 2 },
  medium: { label: "Medium", dots: 3 },
  large: { label: "Large", dots: 4 },
  complex: { label: "Complex", dots: 5 },
};
