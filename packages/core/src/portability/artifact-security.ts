import type { HarnessConfig } from "../types.js";
import { scanPortableContent } from "./capsule.js";
import { parseNativeExtensionBlock } from "./native-extensions.js";
import type { CapsuleValidationFinding } from "./types.js";

function scanValue(
  findings: CapsuleValidationFinding[],
  path: string,
  value: unknown,
): void {
  if (typeof value === "string") {
    findings.push(...scanPortableContent(path, value));
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((child, index) => scanValue(findings, `${path}/${index}`, child));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      scanValue(findings, `${path}/${key}`, child);
    }
  }
}

/**
 * Scan the instruction-bearing and executable surfaces of a whole profile.
 * Structural validation and literal credential detection remain separate so
 * callers can report each failure with a precise policy code.
 */
export function scanHarnessArtifact(profile: HarnessConfig): CapsuleValidationFinding[] {
  const findings: CapsuleValidationFinding[] = [];

  scanValue(findings, "instructions", profile.instructions);
  scanValue(findings, "architectural-constraints", profile["architectural-constraints"]);

  for (const [name, server] of Object.entries(profile["mcp-servers"] ?? {})) {
    if (server.transport === "stdio") {
      findings.push({
        severity: "warn",
        code: "executable-resource",
        path: `mcp-servers/${name}`,
        detail: "profile declares a local MCP process that should be reviewed before publication",
      });
      scanValue(findings, `mcp-servers/${name}`, { command: server.command, args: server.args });
    }
  }

  for (const [target, value] of Object.entries(profile.vendor ?? {})) {
    const path = `vendor/${target}`;
    if (value && typeof value === "object" && ("files" in value || "settings" in value || "omitted" in value)) {
      try {
        const extension = parseNativeExtensionBlock(value);
        for (const file of extension.files ?? []) {
          findings.push(...scanPortableContent(`${path}/${file.path}`, file.content));
        }
        for (const setting of extension.settings ?? []) {
          scanValue(findings, `${path}/${setting.path}`, setting.value);
        }
      } catch (error) {
        findings.push({
          severity: "block",
          code: "invalid-native-extension",
          path,
          detail: error instanceof Error ? error.message : "native-extension block is invalid",
        });
      }
    } else {
      scanValue(findings, path, value);
    }
  }

  return findings;
}
