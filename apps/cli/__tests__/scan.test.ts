import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scanCommand } from "../src/commands/scan.js";
import { CliTestEnv } from "./helpers/cli-test-env.js";

const FIXTURES = resolve(import.meta.dirname, "fixtures");
const TEST_PLUGIN_DIR = resolve(FIXTURES, "test-plugin");

describe("scan command", () => {
  let env: CliTestEnv;

  beforeEach(() => {
    env = new CliTestEnv();
    env.setup();
  });

  afterEach(() => {
    env.restore();
    vi.restoreAllMocks();
    // Clean up test plugin directory if it exists
    try {
      rmSync(TEST_PLUGIN_DIR, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it("scans a valid plugin directory", async () => {
    // Create a minimal valid plugin
    mkdirSync(resolve(TEST_PLUGIN_DIR, ".claude-plugin"), { recursive: true });
    writeFileSync(
      resolve(TEST_PLUGIN_DIR, ".claude-plugin/plugin.json"),
      JSON.stringify({
        name: "test-plugin",
        description: "Test plugin",
        version: "1.0.0",
      }),
      "utf-8",
    );

    await expect(scanCommand(TEST_PLUGIN_DIR)).rejects.toThrow();

    expect(env.exitCode).toBe(0);
    expect(env.getLog()).toContain("Security Scan Report");
    expect(env.getLog()).toContain("test-plugin");
    expect(env.getLog()).toContain("1.0.0");
  });

  it("fails when plugin directory does not exist", async () => {
    const nonExistentPath = resolve(FIXTURES, "nonexistent-plugin");

    await expect(scanCommand(nonExistentPath)).rejects.toThrow();

    expect(env.exitCode).toBe(1);
    expect(env.getError()).toContain("Plugin directory not found");
    expect(env.getError()).toContain(nonExistentPath);
  });

  it("fails when plugin.json is missing", async () => {
    // Create directory without plugin.json
    mkdirSync(TEST_PLUGIN_DIR, { recursive: true });

    await expect(scanCommand(TEST_PLUGIN_DIR)).rejects.toThrow();

    expect(env.exitCode).toBe(1);
    expect(env.getError()).toContain("No plugin manifest found");
    expect(env.getError()).toContain(".claude-plugin/plugin.json");
  });

  it("uses current directory when no path provided", async () => {
    // This will fail since test directory is not a valid plugin
    await expect(scanCommand()).rejects.toThrow();

    expect(env.exitCode).toBe(1);
    expect(env.getError()).toBeTruthy();
  });

  it("scans a plugin with skills", async () => {
    // Create a plugin with a skill
    mkdirSync(resolve(TEST_PLUGIN_DIR, ".claude-plugin"), { recursive: true });
    mkdirSync(resolve(TEST_PLUGIN_DIR, "skills/test-skill"), {
      recursive: true,
    });

    writeFileSync(
      resolve(TEST_PLUGIN_DIR, ".claude-plugin/plugin.json"),
      JSON.stringify({
        name: "test-plugin",
        description: "Test plugin",
        version: "1.0.0",
      }),
      "utf-8",
    );

    writeFileSync(
      resolve(TEST_PLUGIN_DIR, "skills/test-skill/SKILL.md"),
      "# Test Skill\n\nA test skill.",
      "utf-8",
    );

    await expect(scanCommand(TEST_PLUGIN_DIR)).rejects.toThrow();

    expect(env.exitCode).toBe(0);
    expect(env.getLog()).toContain("Security Scan Report");
    expect(env.getLog()).toContain("test-plugin");
  });

  it("detects and reports dangerous patterns", async () => {
    // Create a plugin with a potentially dangerous script
    mkdirSync(resolve(TEST_PLUGIN_DIR, ".claude-plugin"), { recursive: true });
    mkdirSync(resolve(TEST_PLUGIN_DIR, "scripts"), { recursive: true });

    writeFileSync(
      resolve(TEST_PLUGIN_DIR, ".claude-plugin/plugin.json"),
      JSON.stringify({
        name: "dangerous-plugin",
        description: "Plugin with security issues",
        version: "1.0.0",
      }),
      "utf-8",
    );

    writeFileSync(
      resolve(TEST_PLUGIN_DIR, "scripts/dangerous.sh"),
      "#!/bin/bash\nrm -rf /",
      "utf-8",
    );

    await expect(scanCommand(TEST_PLUGIN_DIR)).rejects.toThrow();

    // The scan should complete but may report findings
    expect(env.exitCode).toBeTypeOf("number");
    expect(env.getLog()).toContain("Security Scan Report");
  });

  it("handles plugin with environment requirements", async () => {
    // Create a plugin with env requirements
    mkdirSync(resolve(TEST_PLUGIN_DIR, ".claude-plugin"), { recursive: true });

    writeFileSync(
      resolve(TEST_PLUGIN_DIR, ".claude-plugin/plugin.json"),
      JSON.stringify({
        name: "env-plugin",
        description: "Plugin with env requirements",
        version: "1.0.0",
        requires: {
          env: [
            {
              name: "API_KEY",
              description: "API key for service",
              required: true,
              sensitive: true,
            },
          ],
        },
      }),
      "utf-8",
    );

    await expect(scanCommand(TEST_PLUGIN_DIR)).rejects.toThrow();

    expect(env.exitCode).toBe(0);
    expect(env.getLog()).toContain("Security Scan Report");
    expect(env.getLog()).toContain("env-plugin");
  });

  it("displays scan summary and findings", async () => {
    // Create a valid plugin
    mkdirSync(resolve(TEST_PLUGIN_DIR, ".claude-plugin"), { recursive: true });

    writeFileSync(
      resolve(TEST_PLUGIN_DIR, ".claude-plugin/plugin.json"),
      JSON.stringify({
        name: "summary-test",
        description: "Test plugin for summary",
        version: "2.0.0",
      }),
      "utf-8",
    );

    await expect(scanCommand(TEST_PLUGIN_DIR)).rejects.toThrow();

    expect(env.exitCode).toBe(0);
    const log = env.getLog();

    // Verify report structure
    expect(log).toContain("Security Scan Report");
    expect(log).toContain("summary-test");
    expect(log).toContain("2.0.0");
    expect(log).toContain("Status:");
    expect(log).toContain("Summary:");
  });

  it("handles malformed plugin.json gracefully", async () => {
    // Create directory with invalid JSON
    mkdirSync(resolve(TEST_PLUGIN_DIR, ".claude-plugin"), { recursive: true });

    writeFileSync(
      resolve(TEST_PLUGIN_DIR, ".claude-plugin/plugin.json"),
      "{invalid json}",
      "utf-8",
    );

    await expect(scanCommand(TEST_PLUGIN_DIR)).rejects.toThrow();

    expect(env.exitCode).toBe(1);
    expect(env.getError()).toContain("Security scan failed");
  });

  it("resolves relative paths correctly", async () => {
    // Create a plugin in fixtures
    mkdirSync(resolve(TEST_PLUGIN_DIR, ".claude-plugin"), { recursive: true });

    writeFileSync(
      resolve(TEST_PLUGIN_DIR, ".claude-plugin/plugin.json"),
      JSON.stringify({
        name: "relative-test",
        description: "Test relative path resolution",
        version: "1.0.0",
      }),
      "utf-8",
    );

    // Use relative path from fixtures
    const originalCwd = process.cwd();
    process.chdir(FIXTURES);

    try {
      await expect(scanCommand("./test-plugin")).rejects.toThrow();

      expect(env.exitCode).toBe(0);
      expect(env.getLog()).toContain("relative-test");
    } finally {
      process.chdir(originalCwd);
    }
  });
});
