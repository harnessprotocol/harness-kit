import { looksLikeSecret, sanitizeCommandArgs } from "../portability/secrets.js";
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
  const upper = (key || "secret").replace(/[^A-Za-z0-9]+/g, "_").toUpperCase();
  return `\${HARNESS_${upper}}`;
}

/**
 * Sanitize a URL's query string. A credential in `?access_token=…` is not
 * reachable by key name — the key is "url" — so the query has to be inspected
 * on its own terms. (normalize.ts already strips userinfo; this is the other
 * half.)
 */
function sanitizeUrl(url: string): string {
  const query = url.indexOf("?");
  if (query === -1) return url;
  const head = url.slice(0, query);
  const rest = url.slice(query + 1);
  const [params, fragment] = rest.split("#", 2);
  const sanitized = (params ?? "")
    .split("&")
    .map((pair) => {
      const equals = pair.indexOf("=");
      if (equals === -1) return pair;
      const key = pair.slice(0, equals);
      const value = pair.slice(equals + 1);
      return looksLikeSecret(key, decodeURIComponent(value))
        ? `${key}=${reference(key)}`
        : pair;
    })
    .join("&");
  return `${head}?${sanitized}${fragment === undefined ? "" : `#${fragment}`}`;
}

/**
 * Replace secret-looking values with env references.
 *
 * This deliberately reuses the repo's own sanitizer rules rather than
 * re-deriving them. A hand-rolled walk over `looksLikeSecret(key, value)`
 * alone missed five shapes an adversarial review demonstrated: a positional
 * arg after `--token`, an inline `--api-key=…`, a `headers.Cookie`, a
 * credential in a URL query string, and a secret nested inside a
 * JSON-encoded env value. Prompts are pasted into other agents and tickets,
 * so this is the leakiest sink in the milestone — it gets the strict rules,
 * not the convenient ones.
 */
function sanitize(value: unknown, path: string[] = []): unknown {
  const key = path.at(-1) ?? "";

  if (typeof value === "string") {
    if (key.toLowerCase() === "url") return sanitizeUrl(value);
    // Anything under `headers` is credential-bearing by position, matching
    // sanitizeCapturedSecrets' isSecretPath rule.
    const inHeaders = path.some((segment) => segment.toLowerCase() === "headers");
    if (inHeaders || looksLikeSecret(key, value)) return reference(key);
    // A JSON-encoded blob hides its own keys from the walk above.
    const trimmed = value.trim();
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      try {
        const inner = JSON.parse(trimmed) as unknown;
        const cleaned = sanitize(inner, path);
        if (JSON.stringify(cleaned) !== JSON.stringify(inner)) return JSON.stringify(cleaned);
      } catch {
        // Not JSON after all — fall through and keep the literal.
      }
    }
    return value;
  }

  if (Array.isArray(value)) {
    // Command arguments are positional: `--token <secret>` and
    // `--api-key=<secret>` are only detectable in sequence.
    if (key === "args" && value.every((item) => typeof item === "string")) {
      return sanitizeCommandArgs(value as string[], reference(key));
    }
    return value.map((item) => sanitize(item, path));
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, child]) => [childKey, sanitize(child, [...path, childKey])]),
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
  } else {
    // Stated unconditionally. Conditioning it on a ${HARNESS_*} marker meant
    // that when sanitization matched nothing — including because it FAILED to
    // match — the reader got no warning and reasonably assumed the
    // default-sanitized promise had held.
    lines.push(
      "",
      "Secret values, if any, are shown as ${HARNESS_*} references. Source each from the environment variable of that name, or ask the user — never invent one. Sanitization is heuristic: check the definition above before pasting it anywhere shared.",
    );
  }

  return `${lines.join("\n")}\n`;
}
