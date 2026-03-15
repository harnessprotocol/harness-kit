import { parse } from "yaml";
import type { HarnessConfig } from "../types.js";

export interface ParseResult {
  config: HarnessConfig;
  isLegacyFormat: boolean;
}

export function parseHarness(yamlString: string): ParseResult {
  let raw: unknown;
  try {
    raw = parse(yamlString);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `YAML syntax error: ${msg}\n\nCommon causes: wrong indentation, missing quotes around special characters (like ':' in strings), or tabs used instead of spaces.`,
    );
  }

  if (raw === null || raw === undefined || typeof raw !== "object") {
    throw new Error(
      "harness.yaml is empty or does not contain a YAML mapping.",
    );
  }

  const doc = raw as Record<string, unknown>;

  // Detect legacy format: version is integer 1 instead of string "1"
  const isLegacyFormat =
    "version" in doc && typeof doc.version === "number" && doc.version === 1;

  return {
    config: doc as unknown as HarnessConfig,
    isLegacyFormat,
  };
}
