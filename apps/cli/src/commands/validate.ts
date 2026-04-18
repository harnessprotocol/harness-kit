import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseHarness, validateHarness } from "@harness-kit/core";
import { formatValidationResult } from "../formatters/validation.js";

interface ValidateFlags {
  json?: boolean;
}

export async function validateCommand(filePath?: string, flags: ValidateFlags = {}): Promise<void> {
  const resolved = resolve(filePath ?? "harness.yaml");

  let yamlString: string;
  try {
    yamlString = await readFile(resolved, "utf-8");
  } catch {
    if (flags.json) {
      console.log(JSON.stringify({ valid: false, errors: [`No harness.yaml found at ${resolved}. Specify a path: harness-kit validate <path>`] }));
    } else {
      console.error(
        `No harness.yaml found at ${resolved}. Specify a path: harness-kit validate <path>`,
      );
    }
    process.exit(1);
  }

  let config;
  try {
    ({ config } = parseHarness(yamlString));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (flags.json) {
      console.log(JSON.stringify({ valid: false, errors: [msg] }));
    } else {
      console.error(msg);
    }
    process.exit(1);
  }

  const result = validateHarness(config);

  if (flags.json) {
    console.log(JSON.stringify({
      valid: result.valid,
      errors: result.errors.map((e) => e.path ? `${e.path}: ${e.message}` : e.message),
    }));
  } else {
    console.log(formatValidationResult(result, resolved));
  }
  process.exit(result.valid ? 0 : 1);
}
