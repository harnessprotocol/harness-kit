import type {
  ArchitecturalConstraints,
  ArchitecturalLinter,
  ArchitecturalReviewPattern,
  ArchitecturalStructuralTest,
} from "../types.js";

/**
 * Render an `architectural-constraints` section (HEP-3) as the prose an agent
 * reads before completing a task.
 *
 * Rendered into its OWN marker block rather than merged into the operational
 * slot, so it never collides with a user's `instructions.operational` and can
 * be updated or removed cleanly. It is written to the operational *file* on
 * each platform because that is the only slot mapped on every target — the
 * behavioral slot is null for codex/opencode/windsurf/gemini/junie, and
 * constraints that silently reach three of eight targets would be worse than
 * none at all.
 *
 * Returns null when there is nothing worth writing, so callers can skip the
 * block entirely rather than emit an empty heading.
 */

// Schema defaults, applied here so the rendering is stable whether or not the
// author spelled them out.
const DEFAULT_SEVERITY = "warning";
const DEFAULT_ENFORCEMENT = "block";

const SEVERITY_HEADINGS: Record<string, string> = {
  error: "Must not violate",
  warning: "Should follow",
  info: "Worth considering",
};

// Most severe first — an agent skimming reads the top of the block.
const SEVERITY_ORDER = ["error", "warning", "info"] as const;

function renderPatternGroup(
  severity: string,
  patterns: ArchitecturalReviewPattern[],
): string[] {
  if (patterns.length === 0) return [];
  const lines = [`### ${SEVERITY_HEADINGS[severity]}`, ""];
  for (const p of patterns) {
    // Rules are prose and may already end in a period; don't double it.
    lines.push(`- **${p.name}** — ${p.rule.trim()}`);
  }
  lines.push("");
  return lines;
}

function renderDeterministic(
  linters: ArchitecturalLinter[],
  tests: ArchitecturalStructuralTest[],
): string[] {
  if (linters.length === 0 && tests.length === 0) return [];

  const lines = [
    "### Enforced outside the agent",
    "",
    "These gates run in CI, not in the conversation. `blocks` means a violation",
    "prevents merge — treat it as a hard requirement while working.",
    "",
  ];

  for (const l of linters) {
    const enforcement = l.enforcement ?? DEFAULT_ENFORCEMENT;
    const verb = enforcement === "block" ? "blocks" : "warns";
    lines.push(`- **${l.name}** — linter, ${verb}. ${l.description.trim()}`);
  }

  for (const t of tests) {
    const enforcement = t.enforcement ?? DEFAULT_ENFORCEMENT;
    const verb = enforcement === "block" ? "blocks" : "warns";
    // The entrypoint is the useful part: it is the command the agent can run
    // itself rather than waiting for CI to tell it what it broke.
    const run = t.entrypoint ? ` Run: \`${t.entrypoint.trim()}\`` : "";
    lines.push(
      `- **${t.name}** — structural test, ${verb}. ${t.description.trim()}${run}`,
    );
  }

  lines.push("");
  return lines;
}

export function renderArchitecturalConstraints(
  constraints: ArchitecturalConstraints | undefined,
): string | null {
  if (!constraints) return null;

  const linters = constraints.linters ?? [];
  const tests = constraints["structural-tests"] ?? [];
  const reviewPolicy = constraints["review-policy"];

  // `enabled: false` turns off the LLM review layer only. The deterministic
  // gates still run in CI regardless of what the agent is told, so they stay
  // in the block — the agent should know what will fail on it.
  const reviewActive = (reviewPolicy?.enabled ?? true) && reviewPolicy !== undefined;
  const patterns = reviewActive ? (reviewPolicy?.patterns ?? []) : [];
  const guidance = reviewActive ? reviewPolicy?.guidance?.trim() : undefined;

  if (patterns.length === 0 && !guidance && linters.length === 0 && tests.length === 0) {
    return null;
  }

  const lines: string[] = ["## Architectural constraints", ""];

  if (patterns.length > 0) {
    lines.push(
      "Check these before completing a task in this project.",
      "",
    );
    for (const severity of SEVERITY_ORDER) {
      lines.push(
        ...renderPatternGroup(
          severity,
          patterns.filter((p) => (p.severity ?? DEFAULT_SEVERITY) === severity),
        ),
      );
    }
  }

  if (guidance) {
    lines.push("### Architectural philosophy", "", guidance, "");
  }

  lines.push(...renderDeterministic(linters, tests));

  // Trailing blank lines are an artifact of section assembly; the marker block
  // supplies its own terminator.
  while (lines[lines.length - 1] === "") lines.pop();

  return lines.join("\n");
}

/** `review-policy.model` is deliberately not rendered — it configures whichever
 *  harness runs the review, and is not guidance the agent should read as a rule. */
