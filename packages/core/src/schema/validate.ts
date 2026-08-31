import { parse as parseYaml } from "yaml";
import type { ValidationError, ValidationResult } from "../types.js";
import { isLegacyFormat, isProtocolV2 } from "../utils/legacy.js";
// Precompiled standalone validator (no `eval`/`new Function`), so the desktop
// prod CSP can forbid `unsafe-eval`. Regenerate with `pnpm generate:validator`
// after any change to harness.schema.json — this is a manual step; CI's
// drift-guard step (validate.yml) fails the build if you forget.
import validate from "./validate.generated.js";
import validateV2 from "./validate-v2.generated.js";

const COMMON_FIXES: Record<string, string> = {
  "/version": 'Change version: 1 to version: "1" (add quotes).',
  "/metadata/name":
    "Add a metadata.name field (lowercase kebab-case, max 64 characters).",
  "/metadata/description": "Add a metadata.description field (max 256 characters).",
  "/metadata": "Add a metadata section with name and description fields.",
};

function getFix(schemaPath: string, keyword: string, params: Record<string, unknown>): string | undefined {
  if (keyword === "additionalProperties" && typeof params.additionalProperty === "string") {
    const prop = params.additionalProperty;
    if (prop === "marketplace" || prop === "marketplaces") {
      return 'Use source: owner/repo instead of marketplace: key.';
    }
    return `Remove unknown property '${prop}', or check for typos.`;
  }
  if ((keyword === "const" || keyword === "enum") && schemaPath.includes("version")) {
    return 'version must be the string "1", "2", or "2.1".';
  }
  if (keyword === "propertyNames" && params.propertyName === "copilot") {
    // Only reachable via the v2.1 conditional — the base vendor enum still
    // accepts the legacy "copilot" key for version "2" documents.
    return 'Rename the vendor "copilot" block to "copilot-vscode", or keep version: "2".';
  }
  if (keyword === "required") {
    const missing = params.missingProperty as string;
    const key = schemaPath.replace(/\/properties/g, "") + "/" + missing;
    return COMMON_FIXES[key];
  }
  if (keyword === "pattern") {
    if (schemaPath.includes("source")) {
      return "source must be in owner/repo format. Example: siracusa5/harness-kit";
    }
    if (schemaPath.includes("metadata/properties/name")) {
      return "metadata.name must be lowercase kebab-case (a-z, 0-9, hyphens), max 64 characters.";
    }
  }
  return undefined;
}

// The v2.1 legacy-key conditional in harness-v2.schema.json emits companion
// errors alongside the actionable propertyNames error. Drop them structurally:
// "if" errors carry no information of their own (ajv never emits one without
// the underlying then/else failure also surfacing), and the inner "not"
// failure of a propertyNames subschema duplicates the propertyNames error we
// already report with a friendly message.
function isV21ConditionalNoise(err: { keyword: string; schemaPath: string }): boolean {
  if (err.keyword === "if") return true;
  return err.keyword === "not" && err.schemaPath.endsWith("/propertyNames/not");
}

function getFriendlyMessage(
  keyword: string,
  params: Record<string, unknown>,
  message: string | undefined,
): string {
  if (keyword === "propertyNames" && params.propertyName === "copilot") {
    // Raw ajv output for the v2.1 conditional is "property name must be valid".
    return 'vendor key "copilot" is not valid in version "2.1" — this surface id was renamed to "copilot-vscode".';
  }
  return message ?? "Unknown validation error";
}

function formatPath(instancePath: string): string {
  if (!instancePath) return "(root)";
  return instancePath
    .replace(/^\//, "")
    .replace(/\//g, " → ");
}

// ── Skill name validation ─────────────────────────────────────

const VALID_SKILL_NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function validateSkillName(name: string): boolean {
  if (!name || name.length > 64) return false;
  return VALID_SKILL_NAME_RE.test(name);
}

export function validateHarness(config: unknown): ValidationResult {
  const doc = config as Record<string, unknown>;
  const legacy = isLegacyFormat(doc);

  const protocolV2 = isProtocolV2(doc?.version);
  let schemaErrors = [] as NonNullable<typeof validate.errors>;
  if (protocolV2) {
    validateV2(config);
    schemaErrors.push(...(validateV2.errors ?? []));
    const compatible: Record<string, unknown> = { ...doc, version: "1" };
    delete compatible.scope;
    delete compatible.vendor;
    validate(compatible);
    schemaErrors.push(...(validate.errors ?? []));
  } else {
    validate(config);
    schemaErrors = [...(validate.errors ?? [])];
  }

  const errors: ValidationError[] = schemaErrors
    .filter((err) => !isV21ConditionalNoise(err))
    .map((err) => ({
        path: formatPath(err.instancePath),
        message: getFriendlyMessage(
          err.keyword,
          (err.params as Record<string, unknown>) ?? {},
          err.message,
        ),
        fix: getFix(
          err.schemaPath,
          err.keyword,
          (err.params as Record<string, unknown>) ?? {},
        ),
      }));

  // Validate skill names on plugins (runs even when schema is valid)
  const plugins = (doc?.plugins ?? []) as Array<Record<string, unknown>>;
  for (const plugin of plugins) {
    const name = String(plugin.name ?? "");
    if (!validateSkillName(name)) {
      errors.push({
        path: `plugins → ${name}`,
        message: `Invalid skill name "${name}" — must be lowercase kebab-case (a-z, 0-9, hyphens), max 64 characters, no leading/trailing hyphens.`,
        fix: `Rename to a valid slug, e.g. "${name.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "")}"`,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    isLegacyFormat: legacy,
  };
}

export function validateHarnessYaml(yamlString: string): ValidationResult {
  let doc: unknown;
  try {
    doc = parseYaml(yamlString);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      valid: false,
      errors: [{ path: "(root)", message: `YAML parse error: ${msg}` }],
      isLegacyFormat: false,
    };
  }
  return validateHarness(doc);
}
