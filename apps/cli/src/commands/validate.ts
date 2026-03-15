import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseHarness, validateHarness } from "@harness-kit/core";
import { formatValidationResult } from "../formatters/validation.js";

export async function validateCommand(filePath?: string): Promise<void> {
  const resolved = resolve(filePath ?? "harness.yaml");

  let yamlString: string;
  try {
    yamlString = await readFile(resolved, "utf-8");
  } catch {
    console.error(
      `No harness.yaml found at ${resolved}. Specify a path: harness-kit validate <path>`,
    );
    process.exit(1);
  }

  let config;
  try {
    ({ config } = parseHarness(yamlString));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(msg);
    process.exit(1);
  }

  const result = validateHarness(config);

  console.log(formatValidationResult(result, resolved));
  process.exit(result.valid ? 0 : 1);
}
