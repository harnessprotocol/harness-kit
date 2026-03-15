/** Detect whether a parsed harness config uses the legacy format (version: 1 integer). */
export function isLegacyFormat(doc: Record<string, unknown>): boolean {
  return "version" in doc && typeof doc.version === "number" && doc.version === 1;
}
