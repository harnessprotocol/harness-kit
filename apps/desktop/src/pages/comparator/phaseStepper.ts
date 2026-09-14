import type { ComparisonPhase } from "@harness-kit/shared";

// ── Phase stepper config ────────────────────────────────────
//
// Extracted from ComparatorPage.tsx (no Tauri/React dependencies) so the
// stepper's step ordering and per-step status logic can be unit tested in
// isolation.

// The Execution step is intentionally absent: live in-app execution isn't
// available in this build, and startComparison/loadComparison/endSession
// never set phase to "execution" — the stepper only shows reachable phases.
export const PHASES: { key: ComparisonPhase; label: string; step: number }[] = [
  { key: "setup", label: "Setup", step: 1 },
  { key: "results", label: "Results", step: 2 },
  { key: "judge", label: "Judge", step: 3 },
];

// Derived from PHASES so the stepper's numbering can't drift out of sync
// with the rendered steps again. "execution" is part of ComparisonPhase but
// intentionally absent from PHASES (see comment above) — it's never a real
// currentPhase, so it's left at -1 (before every reachable step) rather than
// hardcoded to a position that would need to be kept in sync by hand.
export const PHASE_INDEX = PHASES.reduce<Record<ComparisonPhase, number>>(
  (acc, p, i) => {
    acc[p.key] = i;
    return acc;
  },
  { setup: -1, execution: -1, results: -1, judge: -1 },
);

export type PhaseStepStatus = "done" | "active" | "pending";

/**
 * Per-step visual state for the phase stepper, keyed to PHASES' order.
 * Pure/side-effect free so its correctness — in particular that it stays in
 * sync with PHASE_INDEX/PHASES after phases are added or removed — can be
 * unit tested without mounting the page.
 */
export function getPhaseStepStatuses(
  currentPhase: ComparisonPhase,
): { key: ComparisonPhase; status: PhaseStepStatus }[] {
  const currentIndex = PHASE_INDEX[currentPhase];
  return PHASES.map((p, i) => ({
    key: p.key,
    status: i < currentIndex ? "done" : i === currentIndex ? "active" : "pending",
  }));
}
