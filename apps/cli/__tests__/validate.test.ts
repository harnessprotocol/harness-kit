import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { validateCommand } from "../src/commands/validate.js";
import { CliTestEnv } from "./helpers/cli-test-env.js";

const FIXTURES = resolve(import.meta.dirname, "fixtures");

describe("validate command", () => {
  let env: CliTestEnv;

  beforeEach(() => {
    env = new CliTestEnv();
    env.setup();
  });

  afterEach(() => {
    env.restore();
    vi.restoreAllMocks();
  });

  it("validates a valid harness.yaml file", async () => {
    const filePath = resolve(FIXTURES, "test-harness.yaml");

    await expect(validateCommand(filePath)).rejects.toThrow();

    expect(env.exitCode).toBe(0);
    expect(env.getLog()).toContain("PASS");
    expect(env.getLog()).toContain("is valid");
  });

  it("fails for an invalid harness.yaml file", async () => {
    const filePath = resolve(FIXTURES, "invalid-harness.yaml");

    await expect(validateCommand(filePath)).rejects.toThrow();

    expect(env.exitCode).toBe(1);
    expect(env.getLog()).toContain("FAIL");
  });

  it("fails when harness.yaml file is missing", async () => {
    const filePath = resolve(FIXTURES, "nonexistent.yaml");

    await expect(validateCommand(filePath)).rejects.toThrow();

    expect(env.exitCode).toBe(1);
    expect(env.getError()).toContain("No harness.yaml found");
    expect(env.getError()).toContain(filePath);
  });

  it("fails when version is missing", async () => {
    const filePath = resolve(FIXTURES, "missing-version.yaml");

    await expect(validateCommand(filePath)).rejects.toThrow();

    expect(env.exitCode).toBe(1);
    expect(env.getLog()).toContain("FAIL");
    expect(env.getLog()).toContain("version");
  });

  it("uses default harness.yaml when no path provided", async () => {
    // This test will fail because there's no harness.yaml in the test directory
    await expect(validateCommand()).rejects.toThrow();

    expect(env.exitCode).toBe(1);
    expect(env.getError()).toContain("No harness.yaml found");
    expect(env.getError()).toContain("harness.yaml");
  });

  it("handles parse errors gracefully", async () => {
    const filePath = resolve(FIXTURES, "malformed.yaml");

    // Create a malformed YAML file
    const { writeFileSync } = await import("node:fs");
    writeFileSync(filePath, "invalid:\n  yaml:\n    - [unclosed", "utf-8");

    await expect(validateCommand(filePath)).rejects.toThrow();

    expect(env.exitCode).toBe(1);
    expect(env.getError()).toBeTruthy();

    // Cleanup
    const { unlinkSync } = await import("node:fs");
    unlinkSync(filePath);
  });

  it("reports validation errors with details", async () => {
    const filePath = resolve(FIXTURES, "invalid-harness.yaml");

    await expect(validateCommand(filePath)).rejects.toThrow();

    expect(env.exitCode).toBe(1);
    expect(env.getLog()).toContain("failed validation");
  });
});
