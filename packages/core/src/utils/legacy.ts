/** Detect whether a parsed harness config uses the legacy format (version: 1 integer). */
export function isLegacyFormat(doc: Record<string, unknown>): boolean {
  return "version" in doc && typeof doc.version === "number" && doc.version === 1;
}

/**
 * Whether a document version belongs to the protocol v2 family ("2" or "2.1").
 * v2.1 keeps the whole v2 feature set (scope, vendor, skills, extends); its only
 * difference is rejecting the legacy "copilot" vendor key in favor of
 * "copilot-vscode". Every gate that switches on protocol-v2 behavior should use
 * this instead of comparing against "2" directly.
 */
export function isProtocolV2(version: unknown): boolean {
  return version === "2" || version === "2.1";
}
