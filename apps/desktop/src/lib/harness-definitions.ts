// ── Shell quoting ───────────────────────────────────────────

/** Wrap a string in single quotes with proper escaping for POSIX shells. */
export function shellQuote(s: string): string {
  if (s.length === 0) return "''";
  // Strip null bytes (would truncate shell arguments and enable injection)
  const clean = s.replace(/\0/g, '');
  // If the string contains no special characters, return as-is.
  if (!/['\s"\\$`!#&|;()<>]/.test(clean)) return clean;
  // Wrap in single quotes, escaping embedded single quotes: ' → '\''
  return "'" + clean.replace(/'/g, "'\\''") + "'";
}

// ── Harness definition type ─────────────────────────────────

export interface HarnessDefinition {
  id: string;
  name: string;
  /** CLI binary name (used for detection and display, not invocation). */
  command: string;
  /** Build the full shell command to invoke this harness with a prompt. */
  buildCommand: (prompt: string, model?: string) => string;
}

// ── Built-in harness definitions ────────────────────────────
// Verified from official docs — see plan for references.

export const BUILTIN_HARNESSES: HarnessDefinition[] = [
  {
    id: "claude",
    name: "Claude Code",
    command: "claude",
    buildCommand: (prompt, model) => {
      // Interactive mode with pre-approved tools so the user doesn't have to
      // click through permission prompts for every standard coding tool.
      const allowedTools = [
        'Read', 'Grep', 'Glob',
        'Agent', 'Skill',
      ].join(',');
      const parts = ["claude", shellQuote(prompt), "--allowedTools", allowedTools];
      if (model) parts.push("--model", shellQuote(model));
      return parts.join(" ");
    },
  },
  {
    id: "cursor-agent",
    name: "Cursor Agent",
    command: "agent",
    buildCommand: (prompt, model) => {
      const parts = ["agent", shellQuote(prompt)];
      if (model) parts.push("--model", shellQuote(model));
      return parts.join(" ");
    },
  },
  {
    id: "copilot",
    name: "GitHub Copilot",
    command: "copilot",
    buildCommand: (prompt, model) => {
      // Copilot uses -i for interactive mode with a prompt (not positional).
      const parts = ["copilot", "-i", shellQuote(prompt)];
      if (model) parts.push("--model", shellQuote(model));
      return parts.join(" ");
    },
  },
  {
    id: "codex",
    name: "Codex CLI",
    command: "codex",
    buildCommand: (prompt, model) => {
      const parts = ["codex", shellQuote(prompt)];
      if (model) parts.push("--model", shellQuote(model));
      return parts.join(" ");
    },
  },
  {
    id: "opencode",
    name: "OpenCode",
    command: "opencode",
    buildCommand: (prompt, model) => {
      const parts = ["opencode", shellQuote(prompt)];
      if (model) parts.push("--model", shellQuote(model));
      return parts.join(" ");
    },
  },
];

// ── Lookup + command builder ────────────────────────────────

const harnessMap = new Map(BUILTIN_HARNESSES.map((h) => [h.id, h]));

/**
 * Build the shell command string for a given harness invocation.
 * Returns `null` if the harness ID is unknown (caller should handle custom commands).
 */
export function buildInvokeCommand(
  harnessId: string,
  prompt: string,
  model?: string,
): string | null {
  const def = harnessMap.get(harnessId);
  if (!def) return null;
  return def.buildCommand(prompt, model);
}

export function getHarness(id: string): HarnessDefinition | undefined {
  return harnessMap.get(id);
}

export function getAllHarnesses(): HarnessDefinition[] {
  return [...BUILTIN_HARNESSES];
}
