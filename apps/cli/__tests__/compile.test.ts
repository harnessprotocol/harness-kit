import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { compileCommand } from "../src/commands/compile.js";
import { CliTestEnv } from "./helpers/cli-test-env.js";

const FIXTURES = resolve(import.meta.dirname, "fixtures");

function loadFixture(name: string): string {
  return readFileSync(resolve(FIXTURES, name), "utf-8");
}

describe("compile command", () => {
  let env: CliTestEnv;

  beforeEach(() => {
    env = new CliTestEnv();
    env.setup();
  });

  afterEach(() => {
    env.restore();
    vi.restoreAllMocks();
  });

  describe("dry-run mode", () => {
    it("compiles with --dry-run flag for single target", async () => {
      const fixturePath = resolve(FIXTURES, "valid-harness.yaml");

      await compileCommand(fixturePath, {
        target: "claude-code",
        dryRun: true,
      });

      const output = env.getLog();
      expect(output).toContain("[DRY RUN]");
      expect(output).toContain("test-harness");
      expect(output).toContain("claude-code");
      expect(output).toContain("No files were written");
      expect(env.exitCode).toBeNull();
    });

    it("compiles with --dry-run for multiple targets", async () => {
      const fixturePath = resolve(FIXTURES, "valid-harness.yaml");

      await compileCommand(fixturePath, {
        target: "claude-code,cursor",
        dryRun: true,
      });

      const output = env.getLog();
      expect(output).toContain("[DRY RUN]");
      expect(output).toContain("claude-code");
      expect(output).toContain("cursor");
      expect(output).toContain("CLAUDE.md");
      expect(output).toContain(".cursor/rules/harness.mdc");
      expect(env.exitCode).toBeNull();
    });

    it("compiles with --dry-run for all targets", async () => {
      const fixturePath = resolve(FIXTURES, "valid-harness.yaml");

      await compileCommand(fixturePath, {
        target: "all",
        dryRun: true,
      });

      const output = env.getLog();
      expect(output).toContain("claude-code");
      expect(output).toContain("cursor");
      expect(output).toContain("copilot");
      expect(output).toContain("CLAUDE.md");
      expect(output).toContain(".cursor/rules/harness.mdc");
      expect(output).toContain(".github/copilot-instructions.md");
      expect(env.exitCode).toBeNull();
    });

    it("shows file previews in dry-run mode", async () => {
      const fixturePath = resolve(FIXTURES, "valid-harness.yaml");

      await compileCommand(fixturePath, {
        target: "claude-code",
        dryRun: true,
      });

      const output = env.getLog();
      expect(output).toContain("Would write:");
      expect(output).toContain("CLAUDE.md");
      // Should show file content preview
      expect(output).toContain("────────────────────────────────────────");
      expect(env.exitCode).toBeNull();
    });
  });

  describe("target selection", () => {
    it("compiles for single target", async () => {
      const fixturePath = resolve(FIXTURES, "valid-harness.yaml");

      await compileCommand(fixturePath, {
        target: "claude-code",
        dryRun: true,
      });

      const output = env.getLog();
      expect(output).toContain("Targets: claude-code");
      expect(output).not.toContain(".cursor/rules/harness.mdc");
      expect(output).not.toContain(".github/copilot-instructions.md");
      expect(env.exitCode).toBeNull();
    });

    it("compiles for multiple comma-separated targets", async () => {
      const fixturePath = resolve(FIXTURES, "valid-harness.yaml");

      await compileCommand(fixturePath, {
        target: "claude-code,cursor",
        dryRun: true,
      });

      const output = env.getLog();
      expect(output).toContain("claude-code");
      expect(output).toContain("cursor");
      expect(output).not.toContain("copilot");
      expect(env.exitCode).toBeNull();
    });

    it("compiles for all targets with 'all' keyword", async () => {
      const fixturePath = resolve(FIXTURES, "valid-harness.yaml");

      await compileCommand(fixturePath, {
        target: "all",
        dryRun: true,
      });

      const output = env.getLog();
      expect(output).toContain("claude-code");
      expect(output).toContain("cursor");
      expect(output).toContain("copilot");
      expect(env.exitCode).toBeNull();
    });

    it("exits with error for invalid target", async () => {
      const fixturePath = resolve(FIXTURES, "valid-harness.yaml");

      await expect(
        compileCommand(fixturePath, {
          target: "invalid-target",
          dryRun: true,
        }),
      ).rejects.toThrow();

      expect(env.getError()).toContain("Unknown target");
      expect(env.exitCode).toBe(1);
    });

    it("handles whitespace in target list", async () => {
      const fixturePath = resolve(FIXTURES, "valid-harness.yaml");

      await compileCommand(fixturePath, {
        target: " claude-code , cursor ",
        dryRun: true,
      });

      const output = env.getLog();
      expect(output).toContain("claude-code");
      expect(output).toContain("cursor");
      expect(env.exitCode).toBeNull();
    });
  });

  describe("output generation", () => {
    it("generates correct file structure for claude-code", async () => {
      const fixturePath = resolve(FIXTURES, "valid-harness.yaml");

      await compileCommand(fixturePath, {
        target: "claude-code",
        dryRun: true,
      });

      const output = env.getLog();
      expect(output).toContain("CLAUDE.md");
      expect(output).toContain("AGENT.md");
      expect(output).toContain(".mcp.json");
      expect(env.exitCode).toBeNull();
    });

    it("generates correct file structure for cursor", async () => {
      const fixturePath = resolve(FIXTURES, "valid-harness.yaml");

      await compileCommand(fixturePath, {
        target: "cursor",
        dryRun: true,
      });

      const output = env.getLog();
      expect(output).toContain(".cursor/rules/harness.mdc");
      expect(output).toContain(".cursor/mcp.json");
      expect(env.exitCode).toBeNull();
    });

    it("generates correct file structure for copilot", async () => {
      const fixturePath = resolve(FIXTURES, "valid-harness.yaml");

      await compileCommand(fixturePath, {
        target: "copilot",
        dryRun: true,
      });

      const output = env.getLog();
      expect(output).toContain(".github/copilot-instructions.md");
      expect(output).toContain(".vscode/mcp.json");
      expect(env.exitCode).toBeNull();
    });

    it("shows harness markers in output", async () => {
      const fixturePath = resolve(FIXTURES, "valid-harness.yaml");

      await compileCommand(fixturePath, {
        target: "claude-code",
        dryRun: true,
      });

      const output = env.getLog();
      expect(output).toContain("BEGIN harness:test-harness");
      expect(output).toContain("END harness:test-harness");
      expect(env.exitCode).toBeNull();
    });

    it("includes compile report summary", async () => {
      const fixturePath = resolve(FIXTURES, "valid-harness.yaml");

      await compileCommand(fixturePath, {
        target: "claude-code",
        dryRun: true,
      });

      const output = env.getLog();
      expect(output).toContain("Compiled harness:");
      expect(output).toContain("test-harness");
      expect(output).toContain("Targets:");
      expect(env.exitCode).toBeNull();
    });
  });

  describe("error handling", () => {
    it("exits with error when harness.yaml not found", async () => {
      await expect(
        compileCommand("./nonexistent.yaml", {
          target: "claude-code",
          dryRun: true,
        }),
      ).rejects.toThrow();

      expect(env.getError()).toContain("No harness.yaml found");
      expect(env.exitCode).toBe(1);
    });

    it("exits with error for invalid harness.yaml", async () => {
      const fixturePath = resolve(FIXTURES, "invalid-harness.yaml");

      await expect(
        compileCommand(fixturePath, {
          target: "claude-code",
          dryRun: true,
        }),
      ).rejects.toThrow();

      expect(env.getError()).toContain("name");
      expect(env.exitCode).toBe(1);
    });

    it("uses default path when no file specified", async () => {
      // This will fail since harness.yaml doesn't exist in test dir
      await expect(
        compileCommand(undefined, {
          target: "claude-code",
          dryRun: true,
        }),
      ).rejects.toThrow();

      expect(env.getError()).toContain("harness.yaml");
      expect(env.exitCode).toBe(1);
    });
  });

  describe("verbose mode", () => {
    it("passes verbose flag to compile function", async () => {
      const fixturePath = resolve(FIXTURES, "valid-harness.yaml");

      await compileCommand(fixturePath, {
        target: "claude-code",
        dryRun: true,
        verbose: true,
      });

      // Verbose mode is passed to compile but doesn't change CLI output structure
      const output = env.getLog();
      expect(output).toContain("test-harness");
      expect(env.exitCode).toBeNull();
    });
  });

  describe("warnings", () => {
    it("displays warnings in compile report", async () => {
      const fixturePath = resolve(FIXTURES, "valid-harness.yaml");

      // Cursor has non-enforceable deny permissions which generate warnings
      await compileCommand(fixturePath, {
        target: "cursor",
        dryRun: true,
      });

      const output = env.getLog();
      expect(output).toContain("Warnings:");
      expect(output).toContain("not machine-enforceable");
      expect(env.exitCode).toBeNull();
    });
  });

});
