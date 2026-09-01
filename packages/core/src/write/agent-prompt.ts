import { looksLikeSecret } from "../portability/secrets.js";
import { getSurface } from "../surfaces/registry.js";
import { isRecord } from "../utils/is-record.js";
import type { CellActionPlan, CellActionRequest } from "./plan-cell-action.js";

/**
 * The third action surface (AC-11): a prompt instructing the target harness's
 * OWN agent to make the change, for cells HarnessKit cannot or should not
 * write directly.
 *
 * Secrets are replaced with `${HARNESS_*}` references by default and the
 * prompt tells the agent where to source them (D5, AC-22). A prompt is text
 * the user pastes somewhere — into another agent, a ticket, a message — so it
 * leaves the machine far more readily than a config file does, and defaulting
 * to literals would leak credentials by accident. `revealSecrets` covers the
 * deliberate local one-paste case and says so inside the prompt itself.
 */
export interface AgentPromptOptions {
  /** Include literal secret values. Off by default; warns inside the prompt. */
  revealSecrets?: boolean;
}

/** `${HARNESS_<NAME>}` reference for a secret-bearing key. */
function reference(key: string): string {
  const upper = key.replace(/[^A-Za-z0-9]+/g, "_").toUpperCase();
  return `\${HARNESS_${upper}}`;
}

/** Replace secret-looking values with env references, recursively. */
function sanitize(value: unknown, key = ""): unknown {
  if (typeof value === "string") return looksLikeSecret(key, value) ? reference(key) : value;
  if (Array.isArray(value)) return value.map((item) => sanitize(item, key));
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, child]) => [childKey, sanitize(child, childKey)]),
    );
  }
  return value;
}

/**
 * Build the agent prompt for one cell action. Always returns a prompt — a
 * cell with no direct-write path is exactly the case this exists for (AC-13).
 */
export function buildAgentPrompt(
  plan: CellActionPlan,
  request: CellActionRequest,
  options: AgentPromptOptions = {},
): string {
  const target = getSurface(request.to);
  const source = getSurface(request.from);
  const reveal = options.revealSecrets === true;
  const value = reveal ? plan.value : sanitize(plan.value);
  const targetFile = plan.target?.file ?? "its own configuration";

  const lines = [
    `Add the ${request.kind} "${request.name}" to ${target.label}.`,
    "",
    `It is already configured in ${source.label} and missing from ${target.label}. Reproduce it using ${target.label}'s own configuration — do not copy ${source.label}'s file format verbatim.`,
    "",
    `Target configuration: ${targetFile}`,
    `Scope: ${request.scope === "user" ? "user/global (applies everywhere)" : "this project only"}`,
    "",
    "Definition to reproduce:",
    "```json",
    JSON.stringify(value ?? null, null, 2),
    "```",
  ];

  if (!plan.supported && plan.reason) {
    lines.push("", `Note: HarnessKit cannot write this cell directly — ${plan.reason}`);
  }
  if (plan.loss && plan.loss.losses.length > 0) {
    lines.push(
      "",
      `${target.label} may not express every field: ${plan.loss.losses.map((item) => item.detail).join("; ")}`,
    );
  }
  if (reveal) {
    lines.push(
      "",
      "WARNING: this prompt contains a real secret value. It is intended for a single local paste — do not commit it, forward it, or paste it into a shared channel.",
    );
  } else if ((JSON.stringify(value) ?? "").includes("${HARNESS_")) {
    lines.push(
      "",
      "Secret values are shown as ${HARNESS_*} references. Source each from the environment variable of that name, or ask the user for the value — never invent one.",
    );
  }

  return `${lines.join("\n")}\n`;
}
