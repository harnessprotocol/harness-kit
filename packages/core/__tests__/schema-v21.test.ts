import { describe, it, expect } from "vitest";
import { validateHarness } from "../src/schema/validate.js";
import type { HarnessConfig } from "../src/index.js";

function v2Profile(extra: Partial<HarnessConfig>): HarnessConfig {
  return {
    version: "2",
    scope: "personal",
    metadata: { name: "portable", description: "Portable harness" },
    skills: [{ name: "review", source: "./skills/review" }],
    ...extra,
  };
}

describe("Harness Protocol v2.1", () => {
  it("validates a v2.1 doc with re-keyed vendor blocks", () => {
    const config = v2Profile({
      version: "2.1",
      vendor: {
        "copilot-vscode": { "chat.mode": "agent" },
        "claude-desktop": { theme: "dark" },
      },
    });
    expect(validateHarness(config)).toMatchObject({ valid: true, errors: [] });
  });

  it("rejects the legacy copilot vendor key on v2.1 with a message naming copilot-vscode", () => {
    const config = v2Profile({
      version: "2.1",
      vendor: { copilot: {} },
    });
    const result = validateHarness(config);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].path).toContain("vendor");
    expect(result.errors[0].message).toContain("copilot-vscode");
    expect(result.errors[0].fix).toContain("copilot-vscode");
  });

  it("still accepts the legacy copilot vendor key on v2 docs", () => {
    const config = v2Profile({
      vendor: { copilot: {} },
    });
    expect(validateHarness(config)).toMatchObject({ valid: true, errors: [] });
  });

  it("validates a v2.1 doc otherwise identical to a valid v2 doc", () => {
    const shared: Partial<HarnessConfig> = {
      scope: "organization",
      vendor: { codex: { model: "gpt-5" } },
      extends: [{ source: "siracusa5/harness-kit", version: ">=1.0.0" }],
    };
    expect(validateHarness(v2Profile(shared))).toMatchObject({ valid: true, errors: [] });
    expect(validateHarness(v2Profile({ ...shared, version: "2.1" }))).toMatchObject({
      valid: true,
      errors: [],
    });
  });

  it("fails an unknown version with the existing error shape", () => {
    const config = v2Profile({ version: "3" });
    const result = validateHarness(config);
    expect(result.valid).toBe(false);
    const versionError = result.errors.find((e) => e.path === "version");
    expect(versionError).toBeDefined();
    expect(versionError?.message).toBeTruthy();
    expect(versionError?.fix).toContain("version must be the string");
  });
});
