import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { parse as parseYaml } from "yaml";
import type { ValidationError, ValidationResult } from "../types.js";
import { isLegacyFormat } from "../utils/legacy.js";
import harnessSchema from "./harness.schema.json" with { type: "json" };

const ajv = new Ajv2020({ allErrors: true, verbose: true });
addFormats(ajv);

const validate = ajv.compile(harnessSchema);

const COMMON_FIXES: Record<string, string> = {
  "/version": 'Change version: 1 to version: "1" (add quotes).',
  "/metadata/name": "Add a metadata.name field (lowercase kebab-case, max 64 characters).",
  "/metadata/description": "Add a metadata.description field (max 256 characters).",
  "/metadata": "Add a metadata section with name and description fields.",
};

function getFix(
  schemaPath: string,
  keyword: string,
  params: Record<string, unknown>,
): string | undefined {
  if (keyword === "additionalProperties" && typeof params.additionalProperty === "string") {
    const prop = params.additionalProperty;
    if (prop === "marketplace" || prop === "marketplaces") {
      return "Use source: owner/repo instead of marketplace: key.";
    }
    return `Remove unknown property '${prop}', or check for typos.`;
  }
  if (keyword === "const" && schemaPath.includes("version")) {
    return 'version must be the string "1". Change version: 1 to version: "1".';
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

function formatPath(instancePath: string): string {
  if (!instancePath) return "(root)";
  return instancePath.replace(/^\//, "").replace(/\//g, " → ");
}

export function validateHarness(config: unknown): ValidationResult {
  const doc = config as Record<string, unknown>;
  const legacy = isLegacyFormat(doc);

  const valid = validate(config);

  if (valid) {
    return { valid: true, errors: [], isLegacyFormat: legacy };
  }

  const errors: ValidationError[] = (validate.errors ?? []).map((err) => ({
    path: formatPath(err.instancePath),
    message: err.message ?? "Unknown validation error",
    fix: getFix(err.schemaPath, err.keyword, (err.params as Record<string, unknown>) ?? {}),
  }));

  return { valid: false, errors, isLegacyFormat: legacy };
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
